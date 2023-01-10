// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Aug 9, 2022 Version 3.0.0 (v3)

const { InstanceBase, Regex, runEntrypoint, shortid, combineRgb, TCPHelper } = require('@companion-module/base')

const actionFunctions = require('./actions.js')
const feedbackFunctions = require('./feedbacks.js')
const upgrade = require('./upgrade')
const paramFuncs = require('./paramFuncs')

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
		this.levelCommands = [] // Commands that set a level
		this.rcpPresets = []
		this.productName = ''
		this.dataStore = {}
		this.newConsole()
	}

	// Change in Configuration
	async configUpdated(config) {
		this.config = config
		console.log('config: ', this.config)
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
		console.log('Running getConfigFields()')
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
		this.createPresets()
		this.initTCP()
	}

	// Get info from a connected console
	getConsoleInfo() {
		this.sendCmd(`devinfo productname`)
		if (this.config.model == 'PM') {
			this.sendCmd(`scpmode sstype "text"`)
		}
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
				this.getConsoleInfo()
				this.pollrcp()
			})

			this.socket.on('data', (chunk) => {
				receivebuffer += chunk

				receivedLines = receivebuffer.split('\x0A') // Split by line break
				if (receivedLines.length == 0) return // No messages

				if (receivebuffer.slice(-1) != '\x0A') {
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

					if (line.indexOf('OK devinfo productname') !== -1) {
						this.productName = line.slice(line.lastIndexOf(' '))
						this.log('info', `Device found: ${this.productName}`)
					} else {
						receivedcmds = paramFuncs.parseData(this, line, RCP_VALS) // Break out the parameters

						for (let i = 0; i < receivedcmds.length; i++) {
							let cmdToFind = receivedcmds[i].Address
							foundCmd = this.rcpCommands.find((cmd) => cmd.Address == cmdToFind) // Find which command
							if (foundCmd !== undefined) {
								let curCmd = JSON.parse(JSON.stringify(receivedcmds[i]))
								this.addToDataStore({ rcp: foundCmd, cmd: curCmd })
								if (this.isRecordingActions) {
									this.addToActionRecording({ rcp: foundCmd, cmd: curCmd })
								}
								this.checkFeedbacks()
								if (foundCmd.Command == 'scninfo') {
									this.pollrcp()
								}
							} else {
								this.log('debug', `Unknown command: '${cmdToFind}'`)
							}
						}
					}
				}
			})
		}
	}

	sendCmd(c) {
		if (c !== undefined) {
			this.log('debug', `Sending : '${c}' to ${this.config.host}`)

			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(`${c}\n`) // send the message to the console
			} else {
				this.log('info', 'Socket not connected :(')
			}
		}
	}

	// Create the Actions & Feedbacks
	updateActions(system) {
		let commands = {}
		let feedbacks = {}
		let command = {}
		let rcpAction = ''

		for (let i = 0; i < this.rcpCommands.length; i++) {
			command = this.rcpCommands[i]
			rcpAction = command.Address
			let newAction = actionFunctions.createAction(this, command)
			newAction.callback = async (event) => {
				let cmd = (await actionFunctions.parseCmd(this, 'set', event.actionId, event.options)).replace(
					'MIXER_',
					'MIXER:'
				)
				if (cmd !== undefined) {
					this.sendCmd(cmd)
				}
			}

			commands[rcpAction] = newAction
			feedbacks[rcpAction] = feedbackFunctions.createFeedbackFromAction(this, newAction)
		}

		this.setActionDefinitions(commands)
		this.setFeedbackDefinitions(feedbacks)

		//		this.log('info','******** RCP COMMAND LIST *********');
		//		Object.entries(commands).forEach(([key, value]) => this.log('info',`${value.name.padEnd(36, '\u00A0')} ${key}`));
		//		this.log('info','***** END OF COMMAND LIST *****')
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
				steps: [{ down: [{ actionId: 'internal:Action Recorder: Set connections' }] }],
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
	pollrcp() {
		console.log('\nInside pollrcp()\n')

		this.subscribeActions()
		this.subscribeFeedbacks()
	}

	addToDataStore(cmd) {
		let idx = cmd.rcp.Index
		let dsAddr = cmd.rcp.Address
		let iY

		if (cmd.cmd.Val == undefined) {
			cmd.cmd.Val = parseInt(cmd.cmd.X)
			cmd.cmd.X = undefined
		}
		cmd.cmd.X = (cmd.cmd.X == undefined) ? 0 : cmd.cmd.X
		let iX = parseInt(cmd.cmd.X) + 1
		if (this.config.model == 'TF' && idx == 1000) {
			iY = cmd.cmd.Address.slice(-1)
		} else {
			cmd.cmd.Y = (cmd.cmd.Y == undefined) ? 0 : cmd.cmd.Y
			iY = parseInt(cmd.cmd.Y) + 1
		}
		if (this.dataStore[dsAddr] == undefined) {
			this.dataStore[dsAddr] = {}
		}
		if (this.dataStore[dsAddr][iX] == undefined) {
			this.dataStore[dsAddr][iX] = {}
		}
		this.dataStore[dsAddr][iX][iY] = cmd.cmd.Val
	}

	handleStartStopRecordActions(isRecording) {
		// Track whether actions are being recorded
		// Other modules may need to start/stop some real work here to be fed appropriate data from a device/library
		this.isRecordingActions = isRecording
	}

	// Add a command to the Action Recorder
	addToActionRecording(c) {
		let foundActionIdx = -1

		let cX = parseInt(c.cmd.X)
		let cY = parseInt(c.cmd.Y)
		let cV

		switch (c.rcp.Type) {
			case 'integer':
			case 'binary':
				cX++
				cY++
				cV = parseInt(c.cmd.Val)
				break
			case 'string':
				cX++
				cY++
				cV = c.cmd.Val
				break
			case 'scene':
				cX = (this.config.model == 'PM') ? c.cmd.X : parseInt(c.cmd.Val)
		}

		this.recordAction(
			{
				actionId: c.rcp.Address,
				options: { X: cX, Y: cY, Val: cV },
			},
			`${c.rcp.Address} ${cX} ${cY}` // uniqueId to stop duplicates
		)
	}
}

runEntrypoint(instance, upgrade)
