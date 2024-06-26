module.exports = {
	// Create single Action/Feedback
	createAction: (instance, rcpCmd) => {
		const rcpNames = require('./rcpNames.json')
		const rsioChoices = require('./rsioChoices.json')
		const paramFuncs = require('./paramFuncs.js')

		let newAction = {}
		let paramsToAdd = []
		let actionName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"

		// Add the commands from the data file. Action id's (action.actionId) are the rcp command text (Address)
		let actionNameParts = actionName.split('/')
		let rcpNameIdx = actionName.startsWith('Cue') || actionName.startsWith('Meter') ? 1 : 0

		newAction = { name: actionName, options: [] }

		// X parameter - always an integer
		if (rcpCmd.X > 1) {
			let XOpts = {
				type: 'textinput',
				label: actionNameParts[rcpNameIdx],
				id: 'X',
				default: 1,
				required: true,
				useVariables: true,
			}
			if (rsioChoices[actionName] !== undefined) {
				XOpts = {
					...XOpts,
					type: 'dropdown',
					label: rsioChoices[actionName].xName || actionNameParts[rcpNameIdx],
					minChoicesForSearch: 0,
					choices: rsioChoices[actionName].X,
					allowCustom: true,
				}
			} else if (actionNameParts[rcpNameIdx].endsWith('Ch')) {
				XOpts = {
					...XOpts,
					type: 'dropdown',
					label: actionNameParts[rcpNameIdx],
					minChoicesForSearch: 0,
					choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
					allowCustom: true,
				}
			}
			paramsToAdd.push(XOpts)
			rcpNameIdx++
		}

		// Y Parameter - always an integer
		if (rcpCmd.Y > 1) {
			if (actionNameParts[rcpNameIdx] == 'PEQ') {
				rcpNameIdx++
			}
			let YOpts = {
				type: 'textinput',
				label: actionNameParts[rcpNameIdx],
				id: 'Y',
				default: 1,
				required: true,
				useVariables: true,
				allowCustom: true,
			}
			if ((config.model == 'TF' || config.model == 'DM3' || config.model == 'DM7') && rcpCmd.Index >= 1000 && rcpCmd.Index < 1010) {
				YOpts = {
					...YOpts,
					type: 'dropdown',
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
				}
			} else if (actionNameParts[0] == 'Cue') {
				YOpts = {
					...YOpts,
					label: 'Cue Bus',
					type: 'dropdown',
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
				}
			} else if (rcpCmd.Type == 'mtr') {
				YOpts.type = 'dropdown'
				let pickoffs = rcpCmd.Pickoff?.split('|')
				if (pickoffs) {
					YOpts.label = 'Pickoff'
					YOpts.choices = []
					for (i = 0; i < pickoffs.length; i++) {
						YOpts.choices.push({ id: i + 1, label: pickoffs[i] })
					}
					YOpts.default = 1
				}
			}
			paramsToAdd.push(YOpts)
		}
		if (rcpNameIdx < actionNameParts.length - 1) {
			rcpNameIdx++
		}

		// Val Parameter - integer, freq, mtr, binary or string
		let ValOpts = {
			type: 'dropdown',
			label: actionNameParts[rcpNameIdx],
			id: 'Val',
			default: rcpCmd.Default,
			required: true,
			minChoicesForSearch: 0,
			allowCustom: true,
			useVariables: true,
		}
		switch (rcpCmd.Type) {
			case 'bool':
				ValOpts = {
					...ValOpts,
					label: 'State',
					choices: [
						{ id: 1, label: 'On' },
						{ id: 0, label: 'Off' },
					],
				}
				if (rcpCmd.RW.includes('r')) {
					ValOpts.choices.push({ id: 'Toggle', label: 'Toggle' })
					ValOpts.default = 'Toggle'
				}
				paramsToAdd.push(ValOpts)
				break

			case 'mtr':
				ValOpts.label = 'Level'

			case 'integer':
			case 'freq':
				if (rcpCmd.Max != 0 || rcpCmd.Min != 0) {
					if (rsioChoices[actionName] !== undefined) {
						ValOpts.label = rsioChoices[actionName].valName || actionNameParts[rcpNameIdx]
						ValOpts.choices = rsioChoices[actionName].Val
						paramsToAdd.push(ValOpts)
					} else {
						ValOpts = {
							...ValOpts,
							type: 'textinput',
							default: rcpCmd.Default == -32768 ? '-Inf' : rcpCmd.Default / rcpCmd.Scale,
						}
		
						paramsToAdd.push(ValOpts)

						if (rcpCmd.RW.includes('r')) {
							paramsToAdd.push({
								type: 'checkbox',
								label: 'Relative',
								id: 'Rel',
								default: false,
							})
						}
					}
				}
				break

			case 'string':
			case 'binary':
				if (actionName.startsWith('CustomFaderBank')) ValOpts.choices = rcpNames.customChNames
				else if (actionName.endsWith('Color')) ValOpts.choices = config.model == 'TF' ? rcpNames.chColorsTF : rcpNames.chColors
				else if (actionName.endsWith('Icon')) ValOpts.choices = rcpNames.chIcons
				
				else if (rcpNames[actionName] !== undefined) ValOpts.choices = rcpNames[actionName]

				else if ((config.model == 'PM' || config.model == 'DM7') && rcpCmd.Index >= 1000 && rcpCmd.Index < 1010) {
					ValOpts = { ...ValOpts, type: 'textinput', regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/' }
				} else {
					ValOpts = { ...ValOpts, type: 'textinput', regex: '' }
				}
				paramsToAdd.push(ValOpts)
		}

		// Make sure the current value is stored in dataStore[]

		if (rcpCmd.Index < 1000 && rcpCmd.RW.includes('r')) {
			newAction.subscribe = async (action, context) => {
				let options = await paramFuncs.parseOptions(context, action.options)
				if (options != undefined) {
					let subscrAction = JSON.parse(JSON.stringify(options))
					subscrAction.Address = rcpCmd.Address
					instance.getFromDataStore(subscrAction) // Make sure current values are in dataStore
				}
			}
		}

		newAction.options.push(...paramsToAdd)

		return newAction
	},
	// Create the Actions & Feedbacks
	updateActions: (instance) => {
		const paramFuncs = require('./paramFuncs.js')
		const feedbackFuncs = require('./feedbacks.js')

		let commands = {}
		let feedbacks = {}
		let rcpCommand = {}
		let actionName = ''

		for (let i = 0; i < rcpCommands.length; i++) {
			rcpCommand = rcpCommands[i]
			actionName = rcpCommand.Address.replace(/:/g, '_') // Change the : to _ as companion doesn't like colons in names
			let newAction = module.exports.createAction(instance, rcpCommand)

			if (rcpCommand.RW.includes('r')) {
				feedbacks[actionName] = feedbackFuncs.createFeedbackFromAction(instance, newAction) // only include commands that can be read from the console
			}

			if (rcpCommand.RW.includes('w')) {
				newAction.callback = async (action, context) => {
					let foundCmd = paramFuncs.findRcpCmd(action.actionId) // Find which command
					let XArr = JSON.parse(await context.parseVariablesInString(action.options.X || 0))
					if (!Array.isArray(XArr)) {
						XArr = [XArr]
					}
					let YArr = JSON.parse(await context.parseVariablesInString(action.options.Y || 0))
					if (!Array.isArray(YArr)) {
						YArr = [YArr]
					}

					for (let X of XArr) {
						let opt = action.options
						for (let Y of YArr) {
							opt.X = X
							opt.Y = Y
							let options = await paramFuncs.parseOptions(context, opt)
							let actionCmd = options
							actionCmd.Address = foundCmd.Address
							actionCmd.prefix = 'set'
							instance.addToCmdQueue(actionCmd)
						}
					}
				}

				commands[actionName] = newAction // Only include commands that are writable to the console
			}
		}

		const { graphics } = require('companion-module-utils')
		const { combineRgb } = require('@companion-module/base')

		feedbacks['Meter'] = {
			type: 'advanced',
			name: 'VUMeter',
			description: 'Show a Bargraph VU Meter on the button',
			options: [
				{
					type: 'dropdown',
					label: 'Position',
					id: 'position',
					default: 'right',
					choices: [
						{ id: 'left', label: 'left' },
						{ id: 'right', label: 'right' },
						{ id: 'top', label: 'top' },
						{ id: 'bottom', label: 'bottom' },
					],
				},
				{
					type: 'number',
					label: 'Padding',
					id: 'padding',
					tooltip: 'Distance from edge of button',
					min: 0,
					max: 72,
					default: 1,
					required: true,
				},
				{
					type: 'textinput',
					label: 'Value 1',
					id: 'meterVal1',
					default: '-20',
					useVariables: true,
				},
				{
					type: 'textinput',
					label: 'Value 2',
					id: 'meterVal2',
					default: '',
					useVariables: true,
				},
			],
			callback: async (feedback, context) => {
				let position = feedback.options.position
				let padding = feedback.options.padding
				let ofsX1 = 0
				let ofsX2 = 0
				let ofsY1 = 0
				let ofsY2 = 0
				let bWidth = 0
				let bLength = 0
				const bVal = (mtrVal) => {
					switch (true) {
						case mtrVal <= -30:
							return mtrVal + 62
						case mtrVal <= -18:
							return (mtrVal + 30) * 2 + 25
						case mtrVal <= 0:
							return (mtrVal + 18) * 2.5 + 54
						default:
							return 100 // mtrVal > 0
					}
				}
				switch (position) {
					case 'left':
						ofsX1 = padding
						ofsY1 = 5
						bWidth = feedback.options.meterVal2 ? 3 : 6
						bLength = feedback.image.height - ofsY1 * 2
						ofsX2 = ofsX1 + bWidth + 1
						ofsY2 = ofsY1
						break
					case 'right':
						ofsY1 = 5
						bWidth = feedback.options.meterVal2 ? 3 : 6
						bLength = feedback.image.height - ofsY1 * 2
						ofsX2 = feedback.image.width - bWidth - padding
						ofsX1 = feedback.options.meterVal2 ? ofsX2 - bWidth - 1 : ofsX2
						ofsY2 = ofsY1
						break
					case 'top':
						ofsX1 = 5
						ofsY1 = padding
						bWidth = feedback.options.meterVal2 ? 3 : 7
						bLength = feedback.image.width - ofsX1 * 2
						ofsX2 = ofsX1
						ofsY2 = ofsY1 + bWidth + 1
						break
					case 'bottom':
						ofsX1 = 5
						bWidth = feedback.options.meterVal2 ? 3 : 7
						ofsY2 = feedback.image.height - bWidth - padding
						bLength = feedback.image.width - ofsX1 * 2
						ofsX2 = ofsX1
						ofsY1 = feedback.options.meterVal2 ? ofsY2 - bWidth - 1 : ofsY2
				}
				const options1 = {
					width: feedback.image.width,
					height: feedback.image.height,
					colors: [
						{ size: 45, color: combineRgb(0, 255, 0), background: combineRgb(0, 255, 0), backgroundOpacity: 64 },
						{ size: 52, color: combineRgb(255, 165, 0), background: combineRgb(255, 165, 0), backgroundOpacity: 64 },
						{ size: 1, color: combineRgb(255, 0, 0), background: combineRgb(255, 0, 0), backgroundOpacity: 64 },
					],
					barLength: bLength,
					barWidth: bWidth,
					type: position == 'left' || position == 'right' ? 'vertical' : 'horizontal',
					value: bVal(1 * (await context.parseVariablesInString(feedback.options.meterVal1))),
					offsetX: ofsX1,
					offsetY: ofsY1,
					opacity: 255,
				}
				const peak1 = {
					...options1,
					colors: [
						{ size: 100, color: combineRgb(255, 0, 0), background: combineRgb(255, 0, 0), backgroundOpacity: 64 },
					],
					value: 100,
				}
				let options2 = undefined
				let peak2 = undefined
				if (feedback.options.meterVal2) {
					options2 = {
						...options1,
						value: bVal(1 * (await context.parseVariablesInString(feedback.options.meterVal2))),
						offsetX: ofsX2,
						offsetY: ofsY2,
					}
					peak2 = {
						...options2,
						colors: [
							{ size: 100, color: combineRgb(255, 0, 0), background: combineRgb(255, 0, 0), backgroundOpacity: 64 },
						],
						value: 100,
					}
				}

				let bars = options1.value == 100 ? [graphics.bar(peak1)] : [graphics.bar(options1)]
				if (options2) {
					bars.push(options2.value == 100 ? graphics.bar(peak2) : graphics.bar(options2))
				}

				return { imageBuffer: graphics.stackImage(bars) }
			},
		}

		instance.setActionDefinitions(commands)
		instance.setFeedbackDefinitions(feedbacks)
	},
}
