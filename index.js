// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Aug 9, 2022 Version 3.0.0 (v3)

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
					{ id: 'TF', label: 'TF Console' },
					{ id: 'PM', label: 'Rivage Console' },
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
		let receivebuffer = ''
		let receivedLines = []
		let receivedcmds = []
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
				receivebuffer += chunk
				receivedLines = receivebuffer.split('\x0A') // Split by line break
				if (receivedLines.length == 0) {
					return // No messages
				}

				if (receivebuffer.endsWith('\x0A')) {
					receivebuffer = receivedLines[receivedLines.length - 1] // Broken line, leave it for next time...
					receivedLines.splice(receivedLines.length - 1) // Remove it.
				} else {
					receivebuffer = ''
				}

				for (let line of receivedLines) {
					if (line.length == 0) {
						continue
					}
					this.log('debug', `Received: '${line}'`)
					receivedcmds = paramFuncs.parseData(this, line, RCP_VALS) // Break out the parameters

					for (let i = 0; i < receivedcmds.length; i++) {
						let curCmd = JSON.parse(JSON.stringify(receivedcmds[i])) // deep clone
						let cmdToFind = curCmd.Address

						let reqIdx = this.reqStack.findIndex((c) => 
							(c.Address == curCmd.Address && c.X == (curCmd.X || 0) && c.Y == (curCmd.Y || 0))
						)
						if (reqIdx > -1) {
							this.reqStack.splice(reqIdx, 1) // Remove it!
						} else {
							this.reqStack.shift() // Just in case it's an invalid command stuck in there
						}
						if (this.reqStack.length > 0) { // More to send?
							let cmdToSend = this.reqStack[0] // Oldest
							let req = `get ${cmdToSend.Address} ${cmdToSend.X} ${cmdToSend.Y}`
							this.sendCmd(req)
						}

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

						if (curCmd.Address.startsWith('MIXER:Lib/Scene')) {
							if (curCmd.Status == 'NOTIFY' && curCmd.Command.startsWith('sscurrent')) {
								this.pollConsole()
							}
							varFuncs.setVar(this, curCmd)
							continue
						}

						if (curCmd.Command == 'devinfo') {
							varFuncs.setVar(this, curCmd) // Check and set module vars (message is not a param cmd)
							continue
						}

						this.log('warn', `Unknown command: '${cmdToFind}'`)

					}
				}
			})
		}
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

			newAction.callback = async (event) => {
				let foundCmd = this.findRcpCmd(event.actionId) // Find which command
				let cmd = await actionFuncs.fmtCmd(this, 'set', { rcpCmd: foundCmd, options: event.options })
				if (cmd !== undefined) {
					this.sendCmd(cmd)
				}
			}

			if (rcpCommand.RW == 'rw') commands[rcpAction] = newAction // Ignore readonly commands
			feedbacks[rcpAction] = feedbackFuncs.createFeedbackFromAction(this, newAction)
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
		let data = undefined

		if (cmd !== undefined && cmd.Address !== undefined && cmd.options !== undefined) {
			if (
				this.dataStore[cmd.Address] !== undefined &&
				this.dataStore[cmd.Address][cmd.options.X] !== undefined &&
				this.dataStore[cmd.Address][cmd.options.X][cmd.options.Y] !== undefined
			) {
				data = this.dataStore[cmd.Address][cmd.options.X][cmd.options.Y]
				return data
			}

			if (cmd.Address.startsWith('MIXER:Lib/Scene')) return

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
}

runEntrypoint(instance, upgrade)
