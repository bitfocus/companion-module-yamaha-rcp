// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Oct 11, 2023 Version 3.3.1(v3)

const { InstanceBase, Regex, runEntrypoint, combineRgb, TCPHelper } = require('@companion-module/base')

const paramFuncs = require('./paramFuncs')
const actionFuncs = require('./actions.js')
const feedbackFuncs = require('./feedbacks.js')
const varFuncs = require('./variables.js')
const upgrade = require('./upgrade')

const RCP_VALS = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal']
const MSG_DELAY = 5

// Instance Setup
class instance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	// Startup
	async init(config) {
		this.updateStatus('Starting')
		this.config = config
		this.rcpCommands = []
		this.colorCommands = [] // Commands which have a color field
		this.rcpPresets = []
		this.dataStore = {}		// status, Address (using ":"), X, Y, Val
		this.cmdQueue = []		// prefix, Address (using ":"), X, Y, Val
		this.queueTimer = {}
		this.variables = []
		this.newConsole()
	}

	// Change in Configuration
	async configUpdated(config) {
		this.config = config
		if (this.config.model) {
			this.newConsole()
		}
	}

	// Module deletion
	async destroy() {
		clearTimeout(this.queueTimer)
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		this.log('debug', `destroyed ${this.id}`)
	}

	// Web UI config fields
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address of Console',
				width: 6,
				default: '192.168.0.128',
				regex: Regex.IP,
			},
			{
				type: 'dropdown',
				id: 'model',
				label: 'Console Type',
				width: 6,
				default: 'CL/QL',
				choices: [
					{ id: 'CL/QL', label: 'CL/QL Console' },
					{ id: 'PM', label: 'Rivage PM Console' },
					{ id: 'TF', label: 'TF Console' },
					{ id: 'DM3', label: 'DM3 Console' },
					{ id: 'DM7', label: 'DM7 Console' },
					{ id: 'RIO', label: 'RIO Preamp' },
					{ id: 'TIO', label: 'TIO Preamp' },
				],
			},
		]
	}

	// Whenever the console type changes, update the info
	newConsole() {
		this.log('info', `Console selected: ${this.config.model}`)
		this.rcpCommands = paramFuncs.getParams(this)

		this.updateActions() // Re-do the actions once the console is chosen
		varFuncs.initVars(this)
		//this.createPresets()
		this.initTCP()
	}

	// Initialize TCP
	initTCP() {
		let receiveBuffer = ''
		let receivedLines = []
		let receivedCmds = []
		let foundCmd = {}

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new TCPHelper(this.config.host, 49280)

			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})

			this.socket.on('error', (err) => {
				this.log('error', `Network error: ${err.message}`)
			})

			this.socket.on('connect', () => {
				this.log('info', `Connected!`)
				varFuncs.getVars(this)
				this.processCmdQueue()
			})

			this.socket.on('data', (chunk) => {
				receiveBuffer += chunk
				receivedLines = receiveBuffer.split('\x0A') // Split by line break
				if (receivedLines.length == 0) {
					return // No messages
				}

				if (receiveBuffer.endsWith('\x0A')) {
					receiveBuffer = receivedLines[receivedLines.length - 1] // Broken line, leave it for next time...
					receivedLines.splice(receivedLines.length - 1) // Remove it.
				} else {
					receiveBuffer = ''
				}

				for (let line of receivedLines) {
					if (line.length == 0) {
						continue
					}
					this.log('debug', `Received: '${line}'`)
					receivedCmds = paramFuncs.parseData(this, line, RCP_VALS) // Break out the parameters

					for (let i = 0; i < receivedCmds.length; i++) {
						let curCmd = JSON.parse(JSON.stringify(receivedCmds[i])) // deep clone
						
						if (curCmd.Status == 'NOTIFY' && curCmd.Command.startsWith('sscurrent')) {
							varFuncs.setVar(this, curCmd)
							this.pollConsole()
							continue
						}

						foundCmd = this.findRcpCmd(curCmd.Address) // Find which command
						if (foundCmd != undefined) {
							if (foundCmd.Command == 'prminfo') {
	
								if (!(curCmd.Status == 'OK' && curCmd.Command == 'set')) {
									this.addToDataStore(curCmd)
								}

								if (this.isRecordingActions) {
									this.addToActionRecording({ rcpCmd: foundCmd, options: curCmd })
								}
							}

							varFuncs.setVar(this, curCmd)
							this.processCmdQueue(curCmd)
							continue
						}

						if (curCmd.Command == 'devinfo' || curCmd.Command == 'scpmode') {
							varFuncs.setVar(this, curCmd) // Check and set module vars (message is not a param cmd)
							continue
						}

						if (curCmd.Status != 'OK') {
							this.log('warn', `Unknown command: '${curCmd.Address}'`)
						}

					}
				}
			})
		}
	}

	// New Command (Action or Feedback) to Add
	addToCmdQueue(cmd) {
		clearTimeout(this.queueTimer)
		let cmdToAdd = JSON.parse(JSON.stringify(cmd))		// Deep Clone
		let i = this.cmdQueue.findIndex((c) => 
			((c.prefix == cmdToAdd.prefix) && (c.Address == cmdToAdd.Address) && (c.X == cmdToAdd.X) && (c.Y == cmdToAdd.Y))
		)
		if (i > -1) {
			this.cmdQueue[i] = cmdToAdd	// Replace queued message with new one
		} else {
			this.cmdQueue.push(cmdToAdd)
		}
		this.queueTimer = setTimeout(() => {
			this.processCmdQueue()
		}, MSG_DELAY)
	}

	// When a message comes in from the console, match it up and delete it, and send the next message
	processCmdQueue(cmd) {
		clearTimeout(this.queueTimer)

		if (this.cmdQueue == undefined || this.cmdQueue.length == 0) return
		if (cmd != undefined) {
			let i = this.cmdQueue.findIndex((c) =>
				((c.prefix == 'get') && (c.Address == cmd.Address) && (c.X == cmd.X) && (c.Y == cmd.Y))
			)
			if (i > -1) {
				this.cmdQueue.splice(i, 1)		// Got value from matching request so remove it!
			}			
		}

		if (this.cmdQueue.length > 0) { 		// Messages still to send?
			let nextCmd = this.cmdQueue[0]		// Oldest

			if (nextCmd.prefix == 'set') {
				let nextCmdVal = this.parseVal(nextCmd)
				if (nextCmdVal == undefined) {
					this.cmdQueue.shift()
					this.cmdQueue.push(nextCmd)
					
					this.queueTimer = setTimeout(() => {
						this.processCmdQueue()
					}, MSG_DELAY)

					return
				}
				nextCmd.Val = nextCmdVal
			}
			
			let msg = this.fmtCmd(nextCmd)
			if (this.sendCmd(msg)) {
				nextCmd = this.cmdQueue.shift()		// Get rid of it
				if (nextCmd.prefix == 'set') {
					this.addToDataStore(nextCmd)	// Update to latest value
				}
				this.queueTimer = setTimeout(() => {
					this.processCmdQueue()
				}, MSG_DELAY)
			}
		}
	}

	// Create the Actions & Feedbacks
	updateActions() {
		let commands = {}
		let feedbacks = {}
		let rcpCommand = {}
		let actionName = ''

		for (let i = 0; i < this.rcpCommands.length; i++) {
			rcpCommand = this.rcpCommands[i]
			actionName = rcpCommand.Address.replace(/:/g, '_') // Change the : to _ as companion doesn't like colons in names
			let newAction = actionFuncs.createAction(this, rcpCommand)

			if (rcpCommand.RW.includes('r')) {
				feedbacks[actionName] = feedbackFuncs.createFeedbackFromAction(this, newAction) // only include commands that can be read from the console
			}

			if (rcpCommand.RW.includes('w')) {
				newAction.callback = async (event, context) => {
					let foundCmd = this.findRcpCmd(event.actionId) // Find which command
					let XArr = JSON.parse(await context.parseVariablesInString(event.options.X || 0))
					if (!Array.isArray(XArr)) {
						XArr = [XArr]
					}
					let YArr = JSON.parse(await context.parseVariablesInString(event.options.Y || 0))
					if (!Array.isArray(YArr)) {
						YArr = [YArr]
					}

					for (let X of XArr) {
						let opt = event.options
						for (let Y of YArr) {
							opt.X = X
							opt.Y = Y
							let options = await this.parseOptions(context, opt)
							let actionCmd = options
							actionCmd.Address = foundCmd.Address
							actionCmd.prefix = 'set'
							this.addToCmdQueue(actionCmd)						
						}
					}
				}
				
				commands[actionName] = newAction // Only include commands that are writable to the console

			}
		}

		this.setActionDefinitions(commands)
		this.setFeedbackDefinitions(feedbacks)

	}

	// Create the preset definitions
	createPresets() {
		this.rcpPresets = [
			{
				type: 'button',
				category: 'Macros',
				name: 'Create RCP Macro',
				style: {
					text: 'Record RCP Macro',
					png64: this.ICON_REC_INACTIVE,
					pngalignment: 'center:center',
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
				},
				steps: [
					{
						down: [{ actionId: 'internal:Action Recorder: Set connections' }],
					},
				],
				feedbacks: [
					{
						feedbackId: 'macro',
						options: {
							mode: 'r',
							fg: combineRgb(0, 0, 0),
							bg: combineRgb(255, 0, 0),
						},
					},
				],
			},
		]

		this.setPresetDefinitions(this.rcpPresets)
	}

	// Track whether actions are being recorded
	handleStartStopRecordActions(isRecording) {
		this.isRecordingActions = isRecording
	}

	// Add a command to the Action Recorder
	async addToActionRecording(c) {
		let aId = c.rcpCmd.Address.replace(/:/g, '_')
		let cX = parseInt(c.options.X) + 1
		let cY = parseInt(c.options.Y) + 1
		let cV

		switch (c.rcpCmd.Type) {
			case 'integer':
			case 'binary':
				cV = (c.options.Val == c.rcpCmd.Min) ? '-Inf' : c.options.Val / c.rcpCmd.Scale
				break
			case 'freq':
				cV = c.options.Val / c.rcpCmd.Scale
				break
			case 'bool':
				cV = 'Toggle'
				break
			case 'string':
				cV = c.options.Val
				break
		}

		this.recordAction(
			{
				actionId: aId,
				options: { X: cX, Y: cY, Val: cV },
			},
			`${aId} ${cX} ${cY}` // uniqueId to stop duplicates
		)
	}

	sendCmd(c) {
		if (c !== undefined) {
			c = c.trim()
			this.log('debug', `Sending :    '${c}' to ${this.getVariableValue('modelName')} @ ${this.config.host}`)

			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(`${c}\n`) // send the message to the console
				return true
			} 
			this.log('info', 'Socket not connected :(')
		}
		return false
	}

	findRcpCmd(cmdName) {
		let rcpCommand = undefined
		if (cmdName != undefined) {
			rcpCommand = this.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_').startsWith(cmdName.replace(/:/g, '_')))
		}
		if (rcpCommand == undefined) {
			this.log('debug', `FINDCMD: Unrecognized command. '${cmdName}'`)
		}
		return rcpCommand
	}

	isRelAction(parsedCmd) {
		if (parsedCmd.Val == 'Toggle' || (parsedCmd.Rel != undefined && parsedCmd.Rel == true)) { // Action that needs the current value from the console
			return true
		}
		return false
	}

	// Poll the console for it's status to update buttons via feedback
	pollConsole() {
		//varFuncs.getVars(this)
		this.dataStore = {}
		this.subscribeActions()
		this.checkFeedbacks()
	}

	// Add a value to the dataStore
	addToDataStore(cmd) {
		let dsAddr = cmd.Address
		let dsX = cmd.X == undefined ? 0 : parseInt(cmd.X)
		let dsY = cmd.Y == undefined ? 0 : parseInt(cmd.Y)

		if (this.dataStore[dsAddr] == undefined) {
			this.dataStore[dsAddr] = {}
		}
		if (this.dataStore[dsAddr][dsX] == undefined) {
			this.dataStore[dsAddr][dsX] = {}
		}
		if (this.dataStore[dsAddr][dsX][dsY] != cmd.Val) {
			this.dataStore[dsAddr][dsX][dsY] = cmd.Val
			this.checkFeedbacks(dsAddr.replace(/:/g, '_'))
		}
	}

	// Get a value from the dataStore. If the value doesn't exist, send a request to get it.
	getFromDataStore(cmd) {
		let data = undefined
		if (cmd == undefined) return data

		if (cmd.Address !== undefined) {
			if (
				this.dataStore[cmd.Address] !== undefined &&
				this.dataStore[cmd.Address][cmd.X] !== undefined &&
				this.dataStore[cmd.Address][cmd.X][cmd.Y] !== undefined
			) {
				data = this.dataStore[cmd.Address][cmd.X][cmd.Y]
				return data
			}

			let rcpCmd = this.findRcpCmd(cmd.Address)
			if (rcpCmd !== undefined && rcpCmd.RW.includes('r')) {
				cmd.prefix = 'get'
				this.addToCmdQueue(cmd)
			}
		}
		
		return data

	}
	
	// Create the proper command string to send to the console
	fmtCmd(cmdToFmt) {
		if (cmdToFmt == undefined) return

		let cmdName = cmdToFmt.Address
		let rcpCmd = this.findRcpCmd(cmdName)
		let prefix = cmdToFmt.prefix
		let cmdStart = prefix
		let options = {X: cmdToFmt.X, Y: cmdToFmt.Y, Val: cmdToFmt.Val}

		if (rcpCmd.Index == 1000) {
			switch (this.config.model) {
				case 'TF':
				case 'DM3':
					cmdStart = prefix == 'set' ? 'ssrecall_ex' : 'sscurrent_ex'
					cmdName = `scene_${options.Y == 0 ? 'a' : 'b'}`
					break
				case 'CL/QL':
					cmdStart = prefix == 'set' ? 'ssrecall_ex' : 'sscurrent_ex'
					cmdName = 'MIXER:Lib/Scene'
					break
				case 'PM':
					cmdStart = prefix == 'set' ? 'ssrecallt_ex' : 'sscurrentt_ex'
					cmdName = 'MIXER:Lib/Scene'
					break
				case 'DM7':
					cmdStart = prefix == 'set' ? 'ssrecallt_ex' : 'sscurrentt_ex'
					cmdName = `scene_${options.Y == 0 ? 'a' : 'b'}`
			}
			options.X = ''
			options.Y = ''
		}

		if (rcpCmd.Index > 1000) { // RecallInc/Dec
			cmdStart = 'event'
			options.X = ''
			options.Y = ''
		}

		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set' && rcpCmd.Index <= 1000) { // if it's not "set" then it's a "get" which doesn't have a Value, and RecallInc/Dec don't use a value
			if (rcpCmd.Type == 'string') {
				options.Val = `"${options.Val}"` // put quotes around the string
			}
		} else {
			options.Val = '' // "get" command, so no Value
		}

		return `${cmdStr} ${options.X} ${options.Y} ${options.Val}`.trim() // Command string to send to console
	}

	// Create the proper command string for an action or feedback
	async parseOptions(context, optionsToParse) {

		try {
			let parsedOptions = JSON.parse(JSON.stringify(optionsToParse))		// Deep Clone

			parsedOptions.X = optionsToParse.X == undefined ? 0 : parseInt(await context.parseVariablesInString(optionsToParse.X)) - 1
			parsedOptions.Y = optionsToParse.Y == undefined ? 0 : parseInt(await context.parseVariablesInString(optionsToParse.Y)) - 1

			if (!Number.isInteger(parsedOptions.X) || !Number.isInteger(parsedOptions.Y)) return // Don't go any further if not Integers for X & Y
			parsedOptions.X = Math.max(parsedOptions.X, 0)
			parsedOptions.Y = Math.max(parsedOptions.Y, 0)
			parsedOptions.Val = await context.parseVariablesInString(optionsToParse.Val)
			parsedOptions.Val = (parsedOptions.Val === undefined) ? '' : parsedOptions.Val
			
			return parsedOptions

		} catch(error) {
			this.log('error',`\nparseOptions: optionsToParse = ${JSON.stringify(optionsToParse)}`)
			this.log('error', `parseOptions: STACK TRACE:\n${error.stack}\n`)
		}
	}

	parseVal(cmd) {
		const varFuncs = require('./variables.js')
		let val = cmd.Val

		let rcpCmd = this.findRcpCmd(cmd.Address)
		if (rcpCmd.Type == 'integer' || rcpCmd.Type == 'freq' || rcpCmd.Type == 'binary' || rcpCmd.Type == 'bool') {
			if (rcpCmd.Type != 'bool') {
				if (isNaN(cmd.Val)) {
					if (cmd.Val.toUpperCase() == '-INF') val = rcpCmd.Min
				} else {
					val = parseInt(cmd.Val) * rcpCmd.Scale
				}
			}

			if (!this.isRelAction(cmd)) return val
			let data = this.getFromDataStore(cmd)
			if (data === undefined) return undefined

			if (cmd.Val == 'Toggle') {
				val = 1 - parseInt(data)
				return val
			} 

			let curVal = parseInt(data)
			if (curVal <= -9000) { // Handle bottom of range
				if (cmd.Val < 0) val = -32768
				if (cmd.Val > 0) val = -6000
			} else {
				val = curVal + val	
			}
			val = Math.min(Math.max(val, rcpCmd.Min), rcpCmd.Max) // Clamp it

		}

		return val
	}


}

runEntrypoint(instance, upgrade)
