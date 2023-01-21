// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Aug 9, 2022 Version 3.0.0 (v3)

const { InstanceBase, Regex, runEntrypoint, shortid, combineRgb, TCPHelper } = require('@companion-module/base')

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
		varFuncs.initVars(this)
		this.createPresets()
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

					receivedcmds = paramFuncs.parseData(this, line, RCP_VALS) // Break out the parameters

					for (let i = 0; i < receivedcmds.length; i++) {
						let cmdToFind = receivedcmds[i].Address
						foundCmd = this.rcpCommands.find((cmd) => cmd.Address == cmdToFind) // Find which command
						let curCmd = JSON.parse(JSON.stringify(receivedcmds[i]))

						if (foundCmd !== undefined && foundCmd.Command == 'prminfo') {
							this.addToDataStore(curCmd)
							if (this.isRecordingActions) {
								this.addToActionRecording({ rcp: foundCmd, cmd: curCmd })
							}
							this.checkFeedbacks(foundCmd.Address)
						} else if (['OK', 'OKM', 'NOTIFY'].indexOf(curCmd.Status.toUpperCase()) !== -1) {
							varFuncs.setVar(this, curCmd) // Check and set module vars (message is not a param cmd)
							if (foundCmd !== undefined && foundCmd.Index == 1000 && curCmd.Command.slice(0, 8) == 'ssrecall') {
								console.log('\n\n\nSCENE CMD!!: \n', curCmd)
								this.pollrcp()
							}
						} else {
							this.log('debug', `Unknown command: '${cmdToFind}'`)
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
			let newAction = actionFuncs.createAction(this, command)

			newAction.callback = async (event) => {
				const reg = /\@\(([^:$)]+):custom_([^)$]+)\)/
				let matches = reg.exec(event.options.Val)
				if (matches) {
console.log("\n\n\nSetting Variable ", matches, " to ", data, "\n\n\n")
					let data = instance.dataStore[event.actionId][event.options.X][event.options.optY]
					instance.setCustomVariableValue(matches[2], data)
				}

				let cmd = (await actionFuncs.parseCmd(this, 'set', event.actionId, event.options)).replace(
					'MIXER_',
					'MIXER:'
				)

				if (cmd !== undefined) {
					this.sendCmd(cmd)
				}
			}

			commands[rcpAction] = newAction
			feedbacks[rcpAction] = feedbackFuncs.createFeedbackFromAction(this, newAction)
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
				steps: [
					{ 
						down: [
							{ actionId: 'internal:Action Recorder: Set connections' }
						]
					}
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
	pollrcp() {
		console.log('\nInside pollrcp()\n')

		varFuncs.getVars(this)
		this.subscribeActions()
		this.subscribeFeedbacks()
	}

	// Add a value to the dataStore
	addToDataStore(cmd) {

console.log('\n\n\nAddToDataStore: cmd = \n\n', cmd, '\n\n')

		let dsAddr = cmd.Address

		if (cmd.Val == undefined) {
			cmd.Val = parseInt(cmd.X)
			cmd.X = undefined
		}

		let dsX = (cmd.X == undefined) ? 1 : parseInt(cmd.X) + 1
		let dsY = (cmd.Y == undefined) ? 1 : parseInt(cmd.Y) + 1

		if (this.dataStore[dsAddr] == undefined) {
			this.dataStore[dsAddr] = {}
		}
		if (this.dataStore[dsAddr][dsX] == undefined) {
			this.dataStore[dsAddr][dsX] = {}

		}
		this.dataStore[dsAddr][dsX][dsY] = cmd.Val

console.log(`Adding: [${dsAddr}][${dsX}][${dsY}] = "${cmd.Val}" to dataStore. dataStore = \n`, this.dataStore, '\n\n\n')

	}

	
	// Get a value from the dataStore. If the value doesn't exist, send a request to get it.
	async getFromDataStore(cmd) {
		let data = undefined

		if (this.dataStore[cmd.Address] !== undefined && this.dataStore[cmd.Address][cmd.X] !== undefined) {
			data = parseInt(instance.dataStore[cmd.Address][cmd.X][cmd.Y])
		} else {
			let req = (await actionFunctions.parseCmd(instance, 'get', cmd.Address, cmd)).replace(
				'MIXER_',
				'MIXER:'
			)
			this.sendCmd(req) // Get the current value
		}
		return data
	}


	// Track whether actions are being recorded
	handleStartStopRecordActions(isRecording) {
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
