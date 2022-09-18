// Control module for Yamaha Pro Audio digital mixers
// Originally by Jack Longden <Jack@atov.co.uk> 2019
// Updated by Andrew Broughton <andy@checkcheckonetwo.com>
// Current version as of Aug 8, 2022 is Version 1.6.7

var tcp = require('../../tcp')
var instance_skel = require('../../instance_skel')
var shortid = require('shortid')
var rcpNames = require('./rcpNames.json')
var upgrade = require('./upgrade')
var paramFuncs = require('./paramFuncs')

const RCP_VALS = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal']

// Instance Setup
class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.rcpCommands = []
		this.nameCommands = [] // Commands which have a name field
		this.colorCommands = [] // Commands which have a color field
		this.rcpPresets = []
		this.productName = ''
		this.macroRec = false
		this.macroCount = 0
		this.macroMode = 'latch'
		this.feedbackId = ''
		this.macro = {}
		this.dataStore = {}
	}

	//static DEVELOPER_forceStartupUpgradeScript = 1

	static GetUpgradeScripts() {
		return [upgrade.upg111to112, upgrade.upg112to113, upgrade.upg113to160]
	}

	// Startup
	init() {
		this.updateConfig(this.config)
	}

	// Module deletion
	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		this.log('debug', `destroyed ${this.id}`)
	}

	// Web UI config fields
	config_fields() {
		let fields = [
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address of Console',
				width: 6,
				default: '192.168.0.128',
				regex: this.REGEX_IP,
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

		return fields
	}

	// Change in Configuration
	updateConfig(config) {
		this.config = config
		if (this.config.model) {
			this.rcpCommands = paramFuncs.getParams(this, config)
			this.newConsole()
		}
	}

	// Whenever the console type changes, update the info
	newConsole() {
		this.log('info', `Device model= ${this.config.model}`)

		this.actions() // Re-do the actions once the console is chosen
		this.presets()
		this.init_tcp()
	}

	// Get info from a connected console
	getConsoleInfo() {
		this.socket.send(`devinfo productname\n`)
		this.socket.send(`scpmode sstype "text"\n`)
	}

	// Initialize TCP
	init_tcp() {
		let receivebuffer = ''
		let receivedLines = []
		let receivedcmds = []
		let foundCmd = {}

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, 49280)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				this.status(this.STATUS_ERROR, err)
				this.log('error', `Network error: ${err.message}`)
			})

			this.socket.on('connect', () => {
				this.status(this.STATUS_OK)
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
							//foundCmd = this.rcpCommands.find((cmd) => cmd.Address == cmdToFind.slice(0, cmd.Address.length)) // Find which command
							foundCmd = this.rcpCommands.find((cmd) => cmd.Address == cmdToFind) // Find which command

							if (foundCmd !== undefined) {

								let curCmd = JSON.parse(JSON.stringify(receivedcmds[i]))

								this.addToDataStore({ rcp: foundCmd, cmd: curCmd })
								this.addMacro({ rcp: foundCmd, cmd: receivedcmds[i] })
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

		newAction = { label: rcpLabel, options: [] }
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
				newAction.subscribe = (action) => {
 					let req = this.parseCmd('get', action.action, action.options)
					if (req !== undefined) {
						this.log('debug', `Sending : '${req}' to ${this.config.host}`)
		
						if (this.socket !== undefined && this.socket.connected) {
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
				return newAction
		}

		newAction.options.push(valParams)
		return newAction
	}

	// Create the Actions & Feedbacks
	actions(system) {
		let commands = {}
		let feedbacks = {}
		let command = {}
		let rcpAction = ''

		for (let i = 0; i < this.rcpCommands.length; i++) {
			command = this.rcpCommands[i]
			rcpAction = command.Address.replace(/:/g, '_')

			commands[rcpAction] = this.createAction(command)
			feedbacks[rcpAction] = JSON.parse(JSON.stringify(commands[rcpAction])) // Clone the Action to a matching feedback

			if (this.nameCommands.includes(rcpAction) || this.colorCommands.includes(rcpAction)) {
				feedbacks[rcpAction].type = 'advanced' // New feedback style
				feedbacks[rcpAction].options.pop()
			} else {
				feedbacks[rcpAction].type = 'boolean' // New feedback style

				if (feedbacks[rcpAction].options.length > 0) {
					let lastOptions = feedbacks[rcpAction].options[feedbacks[rcpAction].options.length - 1]
					if (lastOptions.label == 'State') {
						lastOptions.choices.pop() // Get rid of the Toggle setting for Feedbacks
						lastOptions.default = 1 // Don't select Toggle if there's no Toggle!
					}
					if (lastOptions.label == 'Relative') {
						feedbacks[rcpAction].options.pop() // Get rid of Relative checkbox for feedback
					}
				}

				feedbacks[rcpAction].style = { color: this.rgb(0, 0, 0), bgcolor: this.rgb(255, 0, 0) }
			}
		}

		commands['macroRecStart'] = { label: 'Record RCP Macro' }
		commands['macroRecLatch'] = { label: 'Record RCP Macro (latched)' }
		commands['macroUnLatch'] = { label: 'Unlatch RCP Macro' }
		feedbacks['macro'] = {
			label: 'Macro Feedback',
			type: 'advanced',
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					choices: [
						{ id: 'r', label: 'Record' },
						{ id: 'rl', label: 'Record Latch' },
						{ id: 's', label: 'Stop' },
					],
				},
				{ type: 'colorpicker', label: 'Color', id: 'fg', default: this.rgb(0, 0, 0) },
				{ type: 'colorpicker', label: 'Background', id: 'bg', default: this.rgb(255, 0, 0) },
			],
		}

//this.log('info','******** RCP COMMAND LIST *********');
//Object.entries(commands).forEach(([key, value]) => this.log('info',`${value.label.padEnd(36, '\u00A0')} ${key}`));
//this.log('info','***** END OF COMMAND LIST *****')

		this.setActions(commands)
		this.setFeedbackDefinitions(feedbacks)
	}

	// Create the proper command string for an action or poll
	parseCmd(prefix, rcpCmd, opt) {
		if (rcpCmd == undefined || opt == undefined || rcpCmd == 'macro') return

		let scnPrefix = ''
		let optX = opt.X === undefined ? 1 : opt.X
		let optY = opt.Y === undefined ? 0 : opt.Y - 1
		let optVal
		let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_') == rcpCmd)

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
				this.parseVariables(opt.Val, (value) => {
					let optVal = value
				})
				optVal = (prefix == 'set') ? `"${optVal}"` : '' // quotes around the string
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
	presets() {
		this.rcpPresets = [
			{
				category: 'Macros',
				label: 'Create RCP Macro',
				bank: {
					style: 'png',
					text: 'Record RCP Macro',
					png64: this.ICON_REC_INACTIVE,
					pngalignment: 'center:center',
					latch: false,
					size: 'auto',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [{ action: 'macroRecStart' }, { action: 'macroRecLatch', delay: 500 }],
				release_actions: [{ action: 'macroUnLatch' }],
				feedbacks: [
					{ type: 'macro', options: { mode: 'r', fg: this.rgb(0, 0, 0), bg: this.rgb(255, 0, 0) } },
					{ type: 'macro', options: { mode: 'rl', fg: this.rgb(0, 0, 0), bg: this.rgb(255, 255, 0) } },
				],
			},
		]

		this.setPresetDefinitions(this.rcpPresets)
	}

	// Add a command to a Macro Preset
	addMacro(c) {
		let foundActionIdx = -1

		if (this.macroRec) {
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

			// Check for new value on existing action
			let rcpActions = this.macro.actions
			if (rcpActions !== undefined) {
				foundActionIdx = rcpActions.findIndex(
					(cmd) => cmd.action == c.rcp.Address.replace(/:/g, '_') && cmd.options.X == cX && cmd.options.Y == cY
				)
			}

			if (foundActionIdx == -1) {
				rcpActions.push([])
				foundActionIdx = rcpActions.length - 1
			}

			rcpActions[foundActionIdx] = { action: c.rcp.Address.replace(/:/g, '_'), options: { X: cX, Y: cY, Val: cV } }
		}
	}

	dropMacro(preset, button) {
		if (preset.actions == undefined) {
			return
		}

		preset.release_actions = []
		preset.feedbacks = []

		for (var i = 0; i < preset.actions.length; ++i) {
			preset.actions[i].id = shortid.generate()
			preset.actions[i].instance = this.id
			preset.actions[i].label = this.id + ':' + preset.actions[i].action

			preset.feedbacks.push({
				id: shortid.generate(),
				instance_id: this.id,
				type: preset.actions[i].action,
				options: { ...preset.actions[i].options },
				style: { color: this.rgb(0, 0, 0), bgcolor: this.rgb(255, 0, 0) },
			})

			let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_') == preset.actions[i].action)
			
			if (this.nameCommands.includes(rcpCommand.Address.replace(/:/g, '_')) || this.colorCommands.includes(rcpCommand.Address.replace(/:/g, '_'))) {
				preset.feedbacks[i].options.Val = undefined
			}

			if (rcpCommand != undefined && rcpCommand.Type == 'integer' && rcpCommand.Max == 1) {
				preset.actions[i].options.Val = 'Toggle'
			}
		}

		bank_actions[button.page][button.bank].pop() // For some reason this is necessary...
		preset.config = preset.bank
		delete preset.bank
		this.system.emit('import_bank', button.page, button.bank, preset)
	}

	// Handle the Actions
	action(action, button) {

		if (!action.action.startsWith('macro')) {
			// Regular action
			let cmd = this.parseCmd('set', action.action, action.options)

			if (cmd !== undefined) {
				this.log('debug', `Sending : '${cmd}' to ${this.config.host}`)
				if (this.socket !== undefined && this.socket.connected) {
					this.socket.send(`${cmd}\n`) // send it, but add a CR to the end
				} else {
					this.log('info', 'Socket not connected :(')
				}
			}
		} else {
			// Macro
			switch (action.action) {
				case 'macroRecStart':
					if (!this.macroRec) {
						this.macroRec = true
						this.macroMode = ''
						this.macroCount++
						this.feedbackId = feedbacks[button.page][button.bank][0].id
						this.macro = {
							label: `Macro ${this.macroCount}`,
							bank: {
								style: 'text',
								text: `Macro ${this.macroCount}`,
								size: 'auto',
								color: this.rgb(255, 255, 255),
								bgcolor: this.rgb(0, 0, 0),
							},
							actions: [],
						}
					} else {
						this.macroRec = false
						if (this.macro.actions.length > 0) {
							this.dropMacro(this.macro, button)
						} else {
							this.macroCount--
						}
						this.macroMode = 'stopped'
					}
					break

				case 'macroRecLatch':
					if (this.macroMode == '') {
						this.macroMode = 'latch'
					}
					break

				case 'macroUnLatch':
					if (this.macroMode == '') {
						this.macro.bank.latch = false
						this.macroMode = 'one-shot'
					}
			}
		}

		this.checkFeedbacks('macro')
	}

	// Handle the Feedbacks
	feedback(feedback, bank) {
		let options = feedback.options
		let rcpCommand = this.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_') == feedback.type)
		let retOptions = {}

		if (rcpCommand !== undefined) {
			let optVal = (options.Val == undefined) ? options.X : options.Val
			let optX = options.X
			let optY = (options.Y == undefined) ? 1 : options.Y
			if (feedback.type.toLowerCase().includes("scene")) {
				optX = 1
				optY = 1
			}

			//console.log(`\nFeedback: '${feedback.id}' from bank '${bank.text}' is ${feedback.type} (${rcpCommand.Address})`);
			//console.log("options (raw)", options)
			//console.log(`X: ${optX}, Y: ${optY}, Val: ${optVal}`);

			if (this.dataStore[feedback.type] !== undefined && this.dataStore[feedback.type][optX] !== undefined) {
				if (this.dataStore[feedback.type][optX][optY] == optVal) {
					//console.log('  *** Match ***');
					return true
				} else {
					if (this.colorCommands.includes(feedback.type)) {
						let c = rcpNames.chColorRGB[this.dataStore[feedback.type][optX][optY]]
						retOptions.color = c.color
						retOptions.bgcolor = c.bgcolor
						//console.log(`  *** Match *** (Color) ${JSON.stringify(retOptions)}\n`);
						return retOptions
					}
					if (this.nameCommands.includes(feedback.type)) {
						retOptions.text = this.dataStore[feedback.type][optX][optY]
						//console.log(`  *** Match *** (Text) ${JSON.stringify(retOptions)}\n`);
						return retOptions
					}
				}
			}

			return false
		}
		if (feedback.type == 'macro' && feedback.id == this.feedbackId && this.macroRec) {
			if (this.macroMode == 'latch') {
				return { color: this.rgb(0, 0, 0), bgcolor: this.rgb(255, 255, 0), text: 'REC' }
			} else {
				return { color: this.rgb(0, 0, 0), bgcolor: this.rgb(255, 0, 0), text: 'REC' }
			}
		}

		return
	}

	// Poll the console for it's status to update buttons via feedback

	pollrcp() {
		this.subscribeActions()
		let allFeedbacks = this.getAllFeedbacks()
		for (let fb in allFeedbacks) {
			let cmd = this.parseCmd('get', allFeedbacks[fb].type, allFeedbacks[fb].options)
			if (cmd !== undefined && (this.id == allFeedbacks[fb].instance_id) && !cmd.toLowerCase().includes("scene")) {
				this.log('debug', `Sending : '${cmd}' to ${this.config.host}`)
				this.socket.send(`${cmd}\n`)
			}
		}
	}

	addToDataStore(cmd) {
		let idx = cmd.rcp.Index
		let dsAddr = cmd.rcp.Address.replace(/:/g, '_')
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

exports = module.exports = instance
