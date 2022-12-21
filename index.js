// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Aug 9, 2022 Version 2.0.0 (v3)

const { InstanceBase, Regex, runEntrypoint, shortid, combineRgb, TCPHelper } = require('@companion-module/base')

const upgrade = require('./upgrade')
const rcpNames = require('./rcpNames.json')
const paramFuncs = require('./paramFuncs')

const RCP_VALS = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal']

// Instance Setup
class instance extends InstanceBase {
	constructor(internal) {
		super(internal)
		console.log("Finished constructor!")
	}

	// Startup
	async init(config) {
		this.updateStatus("Starting")
		this.config = config
		this.rcpCommands = []
		this.colorCommands = [] // Commands which have a color field
		this.levelCommands = [] // Commands that set a level
//		this.rcpPresets = []
		this.productName = ''
		this.dataStore = {}

		console.log("this: ", this)
		this.newConsole()
		console.log("Finished init!")
	}

	// Change in Configuration
	async configUpdated(config) {
		this.config = config
		console.log("config: ", this.config)
		if (this.config.model) {
			this.newConsole()
		}
		console.log("Finished configUpdated!")
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
		console.log("Running getConfigFields()")
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address of Console',
				width: 6,
				default: '192.168.0.128',
				regex: Regex.IP
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
					{ id: 'PM', label: 'Rivage Console' }
				]
			}
		]
	}

	// Whenever the console type changes, update the info
	newConsole() {
		this.log('info', `Console selected: ${this.config.model}`)
		this.rcpCommands = paramFuncs.getParams(this, this.config)

		this.updateActions() 	// Re-do the actions once the console is chosen
		//this.createPresets()
		this.initTCP()
		console.log("Finished newConsole!")
	}

	// Get info from a connected console
	getConsoleInfo() {
		this.socket.send(`devinfo productname\n`)
		if (this.config.model == 'PM') {
			this.socket.send(`scpmode sstype "text"\n`)
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
				this.updateStatus('connection_failure', err)
				this.log('error', `Network error: ${err.message}`)
			})

			this.socket.on('connect', () => {
				this.updateStatus('ok')
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
								
								this.checkFeedbacks()
								
								if (foundCmd.Command == 'scninfo') {
									this.pollrcp();
								}
							} else {
								this.log('debug', `Unknown command: '${receivedcmds[i].Address}'`)
							}
						}
					}
				}
			})
		}
	}

	handleStartStopRecordActions(isRecording) {
		// Track whether actions are being recorded
		// Other modules may need to start/stop some real work here to be fed appropriate data from a device/library
		this.isRecordingActions = isRecording

		console.log("Recording: ", this.isRecordingActions)

	}

	// Create single Action/Feedback
	createAction(rcpCmd) {
		let newAction = {}
		let valParams = {}
		let rcpLabel = ''

		if (this.config.model == 'TF' && rcpCmd.Type == 'scene') {
			rcpLabel = 'Scene/Bank'
		} else {
			rcpLabel = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"
		}

		// Add the commands from the data file. Action id's (action.action) are the rcp command text (Address)
		let rcpLabels = rcpLabel.split('/')
		let rcpLabelIdx = rcpLabel.startsWith('Cue') ? 1 : 0

		newAction = { name: rcpLabel, options: [] }
		if (rcpCmd.X > 1) {
			if (rcpLabel.startsWith('InCh') || rcpLabel.startsWith('Cue/InCh')) {
				newAction.options = [
					{
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'X',
						default: 1,
						minChoicesForSearch: 0,
						choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
						allowCustom: true
					},
				]
			} else if (this.config.model == 'PM' && rcpCmd.Type == 'scene') {
				newAction.options = [
					{
						type: 'textinput',
						label: rcpLabels[rcpLabelIdx],
						id: 'X',
						default: rcpCmd.Default,
						regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/'
					}
				]
			} else {
				newAction.options = [
					{
						type: 'number',
						label: rcpLabels[rcpLabelIdx],
						id: 'X',
						min: 1,
						max: rcpCmd.X,
						default: 1,
						required: true,
						range: false,
					},
				]
			}
			rcpLabelIdx++
		}

		if (rcpCmd.Y > 1) {
			if (this.config.model == 'TF' && rcpCmd.Type == 'scene') {
				valParams = {
					type: 'dropdown',
					label: rcpLabels[rcpLabelIdx],
					id: 'Y',
					default: 'a',
					choices: [
						{ id: 'a', label: 'A' },
						{ id: 'b', label: 'B' },
					],
				}
			} else {
				valParams = {
					type: 'number',
					label: rcpLabels[rcpLabelIdx],
					id: 'Y',
					min: 1,
					max: rcpCmd.Y,
					default: 1,
					required: true,
					range: false,
				}
			}

			newAction.options.push(valParams)
		}

		if (rcpLabelIdx < rcpLabels.length - 1) {
			rcpLabelIdx++
		}

		switch (rcpCmd.Type) {
			case 'integer':
				newAction.subscribe = async (action) => {
 					let req = await this.parseCmd('get', action.actionId, action.options)
					req = req.replace("MIXER_", "MIXER:")
					if (req !== undefined) {
						this.log('debug', `Sending : '${req}' to ${this.config.host}`)
		
						if (this.socket !== undefined && this.socket.isConnected) {
							this.socket.send(`${req}\n`) // get current param
						} else {
							this.log('info', 'Socket not connected :(')
						}
					}
                }
 
				if (rcpCmd.Max == 1) {
					// Boolean?
					valParams = {
						type: 'dropdown',
						label: 'State',
						id: 'Val',
						default: 'Toggle',
						minChoicesForSearch: 0,
						choices: [
							{ label: 'On', id: 1 },
							{ label: 'Off', id: 0 },
							{ label: 'Toggle', id: 'Toggle' },
						],
					}
				} else {
					newAction.options.push({
						type: 'number',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						min: rcpCmd.Min,
						max: rcpCmd.Max,
						default: parseInt(rcpCmd.Default),
						required: true,
						range: false,
						allowExpression: true
					})
					valParams = {
						type: 'checkbox',
						label: 'Relative',
						id: 'Rel',
						default: false
					}	
				}
				break
			case 'string':
			case 'binary':
				if (rcpLabel.startsWith('CustomFaderBank')) {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.customChNames,
					}
				} else if (rcpLabel.endsWith('Color')) {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: this.config.model == 'TF' ? rcpNames.chColorsTF : rcpNames.chColors,
					}
				} else if (rcpLabel.endsWith('Icon')) {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.chIcons,
					}
				} else if (rcpLabel == 'InCh/Patch') {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.inChPatch,
					}
				} else if (rcpLabel == 'DanteOutPort/Patch') {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.danteOutPatch,
					}
				} else if (rcpLabel == 'OmniOutPort/Patch') {
					valParams = {
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.omniOutPatch,
					}
				} else {
					valParams = {
						type: 'textinput',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						regex: '',
					}
				}
				break

			default:
				newAction.callback = async(event) => {
					let cmd = this.parseCmd('set', event.actionId, event.options).replace("MIXER_", "MIXER:")
		
					if (cmd !== undefined) {
						this.log('debug', `Sending : '${cmd}' to ${this.config.host}`)
						if (this.socket !== undefined && this.socket.isConnected) {
							this.socket.send(`${cmd}\n`) // send it, but add a CR to the end
						} else {
							this.log('info', 'Socket not connected :(')
						}
					}
				}
				return newAction
		}

		newAction.options.push(valParams)
		
		newAction.callback = async(event) => {

			console.log("Action callback event: ", event)
			let cmd = this.parseCmd('set', event.actionId, event.options).replace("MIXER_", "MIXER:")
			console.log("Action Found cmd: ", cmd)

			if (cmd !== undefined) {
				this.log('debug', `Sending : '${cmd}' to ${this.config.host}`)
				if (this.socket !== undefined && this.socket.isConnected) {
					this.socket.send(`${cmd}\n`) // send it, but add a CR to the end
				} else {
					this.log('info', 'Socket not connected :(')
				}
			}
		}
		return newAction
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

			commands[rcpAction] = this.createAction(command)
			feedbacks[rcpAction] = this.createFeedbackFromAction(commands[rcpAction])

		}

		this.setActionDefinitions(commands)
		this.setFeedbackDefinitions(feedbacks)
			
//		this.log('info','******** RCP COMMAND LIST *********');
//		Object.entries(commands).forEach(([key, value]) => this.log('info',`${value.name.padEnd(36, '\u00A0')} ${key}`));
//		this.log('info','***** END OF COMMAND LIST *****')

	}


	createFeedbackFromAction(action) {

		let newFeedback = JSON.parse(JSON.stringify(action)) // Clone the Action to a matching feedback

		if (this.colorCommands.includes(action.name)) {
			newFeedback.type = 'advanced' // New feedback style
			newFeedback.options.pop()
		} else {
			newFeedback.type = 'boolean' // New feedback style

			if (newFeedback.options.length > 0) {
				let lastOptions = newFeedback.options[newFeedback.options.length - 1]
				if (lastOptions.label == 'State') {
					lastOptions.choices.pop() // Get rid of the Toggle setting for Feedbacks
					lastOptions.default = 1 // Don't select Toggle if there's no Toggle!
				}
				if (lastOptions.name == 'Relative') {
					newFeedback.options.pop() // Get rid of Relative checkbox for feedback
				}
			}
		}

		newFeedback.defaultStyle = { color: combineRgb(0, 0, 0), bgcolor: combineRgb(255, 0, 0) }

		console.log("New Feedback: ",newFeedback)

		newFeedback.callback = (event) => {
				
			console.log("Feedback callback event: ", event)

			let options = event.options
			let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address == event.feedbackId)
			let retOptions = {}

			if (rcpCommand !== undefined) {
				let optX
				this.parseVariablesInString(options.X).then(value => {
					optX = value
				})

				let optY = (options.Y == undefined) ? 1 : options.Y

				if (event.feedbackId.toLowerCase().includes("scene")) {
					optX = 1
					optY = 1
				}

				let optVal
				this.parseVariablesInString(options.Val).then(value => {
					optVal = options.Val === undefined ? options.X : value
				})
				console.log(`\nFeedback Event: '${event.feedbackId}' from controlId '${event.controlId}' is ${rcpCommand.Address}`);
				console.log("options (raw)", options)
				console.log(`X: ${optX}, Y: ${optY}, Val: ${optVal}`);

				if (this.dataStore[event.feedbackId] !== undefined && this.dataStore[event.feedbackId][optX] !== undefined) {
					let data = this.dataStore[event.feedbackId][optX][optY]
					if (this.levelCommands.includes(event.feedbackId)) {
						data = (data > -32768) ? (data / 100).toFixed(2) : "-inf"
					}
					if (data == optVal) {
						//console.log('  *** Match ***');
						return true
					} else {
						const reg = /\@\(([^:$)]+):custom_([^)$]+)\)/
						let matches = reg.exec(optVal)
						if (matches) {
							let data = this.dataStore[event.feedbackId][optX][optY]
							if (this.levelCommands.includes(event.feedbackId)) {
								data = (data > -32768) ? (data / 100).toFixed(2) : "-inf"
							}
							this.system.emit('custom_variable_set_value', matches[2], data)
						}
						
						if (this.colorCommands.includes(event.feedbackId)) {
							let c = rcpNames.chColorRGB[this.dataStore[event.feedbackId][optX][optY]]
							retOptions.color = c.color
							retOptions.bgcolor = c.bgcolor
							//console.log(`  *** Match *** (Color) ${JSON.stringify(retOptions)}\n`);
							return retOptions
						}
					}
				}

				return false

			}

			return

		}

		return newFeedback

	}




	// Create the proper command string for an action or poll
	parseCmd(prefix, rcpCmd, opt) {

		console.log("rcpCmd: ",rcpCmd, "opt: ", opt)

		if (rcpCmd == undefined || opt == undefined) return

		let scnPrefix = ''
		
		let optX = opt.X === undefined ? 1 : opt.X
/*
		this.parseVariablesInString(opt.X).then(value => {
			console.log(`\nvalue of ${opt.X} = `, value, "\n\n")
			optX = opt.X === undefined ? 1 : value
		})
*/
		let optY = opt.Y === undefined ? 0 : opt.Y - 1
		let optVal
		let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address == rcpCmd)

console.log("rcpCommand: ", rcpCommand)

		if (rcpCommand == undefined) {
			this.log('debug', `PARSECMD: Unrecognized command. '${rcpCmd}'`)
			return
		}
		let cmdName = rcpCommand.Address

		switch (rcpCommand.Type) {
			case 'integer':
			case 'binary':
				cmdName = `${prefix} ${cmdName}`
				optVal = ''
				if (prefix == 'set') { // if it's not "set" then it's a "get" which doesn't have a Value
					if (opt.Val == 'Toggle') {
						if (this.dataStore[rcpCmd] !== undefined && this.dataStore[rcpCmd][optX] !== undefined) {
							optVal = 1 - parseInt(this.dataStore[rcpCmd][optX][optY + 1])
						}
					} else {
						optVal = opt.Val

						if (opt.Rel != undefined && opt.Rel == true) {
							if (this.dataStore[rcpCmd] !== undefined && this.dataStore[rcpCmd][optX] !== undefined) {
								let curVal = parseInt(this.dataStore[rcpCmd][optX][optY + 1])
								// Handle bottom of range
								if (curVal == -32768 && optVal > 0) {
									curVal = -9600
								} else if (curVal == -9600 && optVal < 0) {
									curVal = -32768
								}
								optVal = curVal + optVal
							}
						}
					}
				}
				optX-- // ch #'s are 1 higher than the parameter
				break

			case 'string':
				cmdName = `${prefix} ${cmdName}`
				this.parseVariablesInString(opt.Val).then((value) => {
					optVal = (prefix == 'set') ? `"${value}"` : '' // quotes around the string
				})
				optX-- // ch #'s are 1 higher than the parameter except with Custom Banks
				break

			case 'scene':
				if (this.config.model == 'PM') {
					optX = `"${opt.X}"`
				}
				optY = ''
				optVal = ''

				if (prefix == 'set') {
					scnPrefix = (this.config.model == 'PM') ? 'ssrecallt_ex' : 'ssrecall_ex'
					//this.pollrcp() // so buttons with feedback reflect any changes?
				} else {
					scnPrefix = (this.config.model == 'PM') ? 'sscurrentt_ex' : 'sscurrent_ex'
					optX = ''
				}

				if (this.config.model != 'TF') {
					cmdName = `${scnPrefix} ${cmdName}` // Recall Scene for CL/QL & Rivage
				} else {
					cmdName = `${scnPrefix} ${cmdName}${opt.Y}` // Recall Scene for TF
				}
		}

		return `${cmdName} ${optX} ${optY} ${optVal}`.trim() // Command string to send to console
	}

	// Create the preset definitions
	createPresets() {
		this.rcpPresets = [
			{
				category: 'Macros',
				name: 'Create RCP Macro',
				bank: {
					style: 'png',
					text: 'Record RCP Macro',
					png64: this.ICON_REC_INACTIVE,
					pngalignment: 'center:center',
					latch: false,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
				},
				actions: [{ action: 'macroRecStart' }, { action: 'macroRecLatch', delay: 500 }],
				release_actions: [{ action: 'macroUnLatch' }],
				feedbacks: [
					{ type: 'macro', options: { mode: 'r', fg: combineRgb(0, 0, 0), bg: combineRgb(255, 0, 0) } },
					{ type: 'macro', options: { mode: 'rl', fg: combineRgb(0, 0, 0), bg: combineRgb(255, 255, 0) } }, //,
				],
			},
		]

		this.setPresetDefinitions(this.rcpPresets)
	}

	// Poll the console for it's status to update buttons via feedback

	pollrcp() {
		this.subscribeActions()
/*
		let allFeedbacks = this.getAllFeedbacks()
		for (let fb in allFeedbacks) {
			let cmd = this.parseCmd('get', allFeedbacks[fb].type, allFeedbacks[fb].options)
			if (cmd !== undefined && (this.id == allFeedbacks[fb].instance_id) && !cmd.toLowerCase().includes("scene")) {
				this.log('debug', `Sending : '${cmd}' to ${this.config.host}`)
				this.socket.send(`${cmd}\n`)
			}
		}
*/
	}

	addToDataStore(cmd) {
		let idx = cmd.rcp.Index
		let dsAddr = cmd.rcp.Address
		let iY

		if (cmd.cmd.Val == undefined) {
			cmd.cmd.Val = parseInt(cmd.cmd.X)
			cmd.cmd.X = undefined
		}

		cmd.cmd.X = cmd.cmd.X == undefined ? 0 : cmd.cmd.X
		let iX = parseInt(cmd.cmd.X) + 1

		if (this.config.model == 'TF' && idx == 1000) {
			iY = cmd.cmd.Address.slice(-1)
		} else {
			cmd.cmd.Y = cmd.cmd.Y == undefined ? 0 : cmd.cmd.Y
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
}

runEntrypoint(instance, upgrade)