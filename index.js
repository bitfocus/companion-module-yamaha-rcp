// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// July 2, 2023 Version 3.2.2 (v3)

const { InstanceBase, Regex, runEntrypoint, combineRgb, TCPHelper } = require('@companion-module/base')

const paramFuncs = require('./paramFuncs')
const actionFuncs = require('./actions.js')
const feedbackFuncs = require('./feedbacks.js')
const varFuncs = require('./variables.js')
const upgrade = require('./upgrade')

const RCP_VALS = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal']

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
		this.dataStore = {}
		this.reqStack = []
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
					if (receivedCmds.length == 0) this.processReqStack()

					for (let i = 0; i < receivedCmds.length; i++) {
						let curCmd = JSON.parse(JSON.stringify(receivedCmds[i])) // deep clone
						let cmdToFind = curCmd.Address

						this.processReqStack(curCmd)

						foundCmd = this.rcpCommands.find((cmd) => cmd.Address == cmdToFind) // Find which command
						if (foundCmd != undefined) {
							if (foundCmd.Command == 'prminfo') {
								this.addToDataStore(curCmd)
								if (this.isRecordingActions) {
									this.addToActionRecording({ rcpCmd: foundCmd, options: curCmd })
								}
								this.checkFeedbacks(foundCmd.Address.replace(/:/g, '_')) // Companion commands use a _ instead of :
								varFuncs.setVar(this, curCmd)
							}
							continue
						}

						if (curCmd.Address.startsWith('MIXER:Lib/Scene') || curCmd.Address.startsWith('scene')) {
							if (curCmd.Status == 'NOTIFY' && curCmd.Command.startsWith('sscurrent')) {
								this.pollConsole()
							}
							varFuncs.setVar(this, curCmd)
							continue
						}

						if (curCmd.Command == 'devinfo' || curCmd.Command == 'scpmode') {
							varFuncs.setVar(this, curCmd) // Check and set module vars (message is not a param cmd)
							continue
						}

						this.log('warn', `Unknown command: '${cmdToFind}'`)

					}
				}
			})
		}
	}

	processReqStack(cmd = {Address: '', X: 0, Y: 0}) {
		if (this.reqStack == undefined || this.reqStack.length == 0) return

		let reqIdx = this.reqStack.findIndex((c) => 
			(c.Address == cmd.Address && c.X == (cmd.X || 0) && c.Y == (cmd.Y || 0))
		)
		if (reqIdx > -1) {
			this.reqStack.splice(reqIdx, 1) // Got value from matching request so remove it!
		} else {
			this.reqStack.shift() // Just in case it's an invalid command stuck in there
		}

		if (this.reqStack.length > 0) { // More to send?
			let cmdToSend = this.reqStack[0] // Oldest
			let req = `get ${cmdToSend.Address} ${cmdToSend.X} ${cmdToSend.Y}`
			this.sendCmd(req)
		}
	}

	// Create the Actions & Feedbacks
	updateActions() {
		let commands = {}
		let feedbacks = {}
		let rcpCommand = {}
		let rcpAction = ''

		for (let i = 0; i < this.rcpCommands.length; i++) {
			rcpCommand = this.rcpCommands[i]
			rcpAction = rcpCommand.Address.replace(/:/g, '_') // Change the : to _ as companion doesn't like colons in names
			let newAction = actionFuncs.createAction(this, rcpCommand)

			newAction.callback = async (event, context) => {
				let foundCmd = this.findRcpCmd(event.actionId) // Find which command
//console.log('action callback: event = ', event, 'foundCmd = ', foundCmd)
				let XArr = JSON.parse(await context.parseVariablesInString(event.options.X || 0))
				if (!Array.isArray(XArr)) {
					XArr = [XArr]
				}
//console.log('action callback: XArr = ', XArr, 'isArray? ', Array.isArray(XArr))
				for (let X of XArr) {
					let opt = event.options
					opt.X = X
					let cmd = await this.fmtCmd(this, 'set', { rcpCmd: foundCmd, options: opt })
					if (cmd !== undefined) {
						this.sendCmd(cmd)
					}					
				}
			}
			
			if (rcpCommand.RW.includes('w')) commands[rcpAction] = newAction // Only inlcude commands that are writable to the console
			if (rcpCommand.RW.includes('r')) feedbacks[rcpAction] = feedbackFuncs.createFeedbackFromAction(this, newAction) // only include commands that can be read from the console
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
				cV = c.options.Val == c.rcpCmd.Min ? '-Inf' : c.options.Val / c.rcpCmd.Scale
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
			} else {
				this.log('info', 'Socket not connected :(')
			}
		}
	}

	findRcpCmd(cmdName) {
		let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_') == cmdName)
		if (rcpCommand == undefined) {
			this.log('debug', `FINDCMD: Unrecognized command. '${cmdName}'`)
		}
		return rcpCommand
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
		this.dataStore[dsAddr][dsX][dsY] = cmd.Val
	}

	// Get a value from the dataStore. If the value doesn't exist, send a request to get it.
	async getFromDataStore(cmd) {
		try {
			let data = undefined
			
			if (cmd == undefined) return data

			if (cmd !== undefined && cmd.Address !== undefined && cmd.options !== undefined) {
				if (
					this.dataStore[cmd.Address] !== undefined &&
					this.dataStore[cmd.Address][cmd.options.X] !== undefined &&
					this.dataStore[cmd.Address][cmd.options.X][cmd.options.Y] !== undefined
				) {
					data = this.dataStore[cmd.Address][cmd.options.X][cmd.options.Y]
					return data
				}

				let rcpCmd = this.findRcpCmd(cmd.Address.replace(/:/g, '_'))
				if (rcpCmd == undefined || rcpCmd.Index >= 1000 || !rcpCmd.RW.includes('r')) return data

				if (this.reqStack.length == 0) {
					this.reqStack.push({Address: cmd.Address, X: cmd.options.X, Y: cmd.options.Y})
					let req = `get ${cmd.Address} ${cmd.options.X} ${cmd.options.Y}`
					this.sendCmd(req) // Get the current value	
				} else {
					let i = this.reqStack.findIndex((c) => 
						(c.Address == cmd.Address && c.X == cmd.options.X && c.Y == cmd.options.Y)
					)
					if (i == -1) {
						this.reqStack.push({Address: cmd.Address, X: cmd.options.X, Y: cmd.options.Y})
					}
				}
			}
			return data

		} catch(error) {
			this.log('error', `getFromDataStore Error: ${error}`)
		}
	}


	// Create the proper command string to send to the console
	async fmtCmd(instance, prefix, cmdToFmt) {
		if (cmdToFmt == undefined) return

		let cmdStart = prefix
		let cmdName = cmdToFmt.rcpCmd.Address
		let options = await this.parseOptions(instance, instance, cmdToFmt)

		if (cmdToFmt.rcpCmd.Index == 1000) {
			switch (instance.config.model) {
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

		if (cmdToFmt.rcpCmd.Index > 1000) { // RecallInc/Dec
			cmdStart = 'event'
			options.X = ''
			options.Y = ''
		}

		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set' && cmdToFmt.rcpCmd.Index <= 1000) { // if it's not "set" then it's a "get" which doesn't have a Value, and RecallInc/Dec don't use a value
			if (cmdToFmt.rcpCmd.Type == 'string') {
				options.Val = `"${options.Val}"` // put quotes around the string
			}
		} else {
			options.Val = '' // "get" command, so no Value
		}

		return `${cmdStr} ${options.X} ${options.Y} ${options.Val}`.trim() // Command string to send to console
	}

	// Create the proper command string for an action or poll
	async parseOptions(instance, context, cmdToParse) {
		try {
			const varFuncs = require('./variables.js')
			let parsedOptions = {}

			parsedOptions.X = cmdToParse.options.X == undefined ? 0 : parseInt(await context.parseVariablesInString(cmdToParse.options.X)) - 1
			parsedOptions.Y = cmdToParse.options.Y == undefined ? 0 : parseInt(await context.parseVariablesInString(cmdToParse.options.Y)) - 1

			if (!Number.isInteger(parsedOptions.X) || !Number.isInteger(parsedOptions.Y)) return // Don't go any further if not Integers for X & Y
			parsedOptions.X = Math.max(parsedOptions.X, 0)
			parsedOptions.Y = Math.max(parsedOptions.Y, 0)
			parsedOptions.Val = await context.parseVariablesInString(cmdToParse.options.Val || '')

			data = await instance.getFromDataStore({ Address: cmdToParse.rcpCmd.Address, options: parsedOptions })

			if (varFuncs.fbCreatesVar(instance, cmdToParse, parsedOptions, data)) return // Are we creating and/or updating a variable?

			if (cmdToParse.rcpCmd.Type == 'integer' || cmdToParse.rcpCmd.Type == 'binary') {
				if (parsedOptions.Val == 'Toggle') {
					parsedOptions.Val = 1 - parseInt(data)
					return parsedOptions
				}

				parsedOptions.Val = parseInt(parsedOptions.Val.toUpperCase() == '-INF' ? cmdToParse.rcpCmd.Min : parsedOptions.Val * cmdToParse.rcpCmd.Scale)

				if (cmdToParse.options.Rel != undefined && cmdToParse.options.Rel == true) {
					// Relative selected?
					let curVal = parseInt(data)

					// Handle bottom of range
					if (curVal == -32768 && parsedOptions.Val > 0) {
						curVal = -9600
					} else if (curVal == -9600 && parsedOptions.Val < 0) {
						curVal = -32768
					}
					parsedOptions.Val = curVal + parsedOptions.Val
				}
				parsedOptions.Val = Math.min(Math.max(parsedOptions.Val, cmdToParse.rcpCmd.Min), cmdToParse.rcpCmd.Max) // Clamp it
			}
			return parsedOptions

		} catch(error) {
			this.log('error', `parseOptions: Error parsing ${cmdToParse}`)
			this.log('error', (data == undefined) ? 'data= undefined' : `data= ${data}`)
			this.log('error', `Error= ${error}\nSTACK TRACE:\n${error.stack}`)
		}		
	}

}

runEntrypoint(instance, upgrade)
