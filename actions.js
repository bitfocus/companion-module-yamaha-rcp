module.exports = {
	// Create single Action/Feedback
	createAction: (instance, rcpCmd) => {
		const rcpNames = require('./rcpNames.json')

		let newAction = {}
		let paramsToAdd = []
		let actionName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"

		// Add the commands from the data file. Action id's (action.actionId) are the rcp command text (Address)
		let actionNameParts = actionName.split('/')
		let rcpNameIdx = actionName.startsWith('Cue') ? 1 : 0

		newAction = { name: actionName, options: [] }

		// X parameter - always an integer
		if (rcpCmd.X > 1) {
			let XOpts = {
				label: actionNameParts[rcpNameIdx],
				id: 'X',
				default: 1,
				required: true,
			}
			if (actionName.startsWith('InCh') || actionName.startsWith('OutCh') || actionName.startsWith('Cue/InCh')) {
				XOpts = {...XOpts,
					type: 'dropdown',
					minChoicesForSearch: 0,
					choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
					allowCustom: true,
				}
			} else {
				XOpts = {...XOpts,
					type: 'textinput',
					useVariables: true,
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
				default: '1',
				required: true,
				useVariables: true,
			}
			if ((instance.config.model == 'TF' || instance.config.model == 'DM3' || instance.config.model == 'DM7') && rcpCmd.Index == 1000) {
				YOpts = {...YOpts,
					type: 'dropdown',
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
					allowCustom: true,
					required: true,
				}
			} else if (actionNameParts[0] == "Cue") {
				YOpts = {...YOpts,
					label: 'Cue Bus',
					type: 'dropdown',
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
					allowCustom: true,
					required: true,
				}
			}
			paramsToAdd.push(YOpts)
		}
		if (rcpNameIdx < actionNameParts.length - 1) {
			rcpNameIdx++
		}

		// Val Parameter - integer, binary or string
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
				ValOpts = {...ValOpts,
					label: 'State',
					choices: [
						{ label: 'On', id: 1 },
						{ label: 'Off', id: 0 },
					],
				}
				if (rcpCmd.RW.includes('r')) {
					ValOpts.choices.push({label: 'Toggle', id: 'Toggle' })
					ValOpts.default = 'Toggle'
				}
				paramsToAdd.push(ValOpts)
				break

			case 'integer':
			case 'freq':
				if (rcpCmd.Max != 0 || rcpCmd.Min != 0) {
					ValOpts = {...ValOpts,
						type: 'textinput',
						default: rcpCmd.Default == -32768 ? '-Inf' : rcpCmd.Default / rcpCmd.Scale,
					}
					paramsToAdd.push(ValOpts)

					if (rcpCmd.Index != 1000) {
						paramsToAdd.push({
							type: 'checkbox',
							label: 'Relative',
							id: 'Rel',
							default: false,
						})
					}
				}
				break

			case 'string':
			case 'binary':
				if (actionName.startsWith('CustomFaderBank')) ValOpts.choices = rcpNames.customChNames
				else if (actionName.endsWith('Color')) ValOpts.choices = instance.config.model == 'TF' ? rcpNames.chColorsTF : rcpNames.chColors
				else if (actionName.endsWith('Icon')) ValOpts.choices = rcpNames.chIcons
				else if (actionName == 'InCh/Patch') ValOpts.choices = rcpNames.inChPatch
				else if (actionName == 'DanteOutPort/Patch') ValOpts.choices = rcpNames.danteOutPatch
				else if (actionName == 'OmniOutPort/Patch') ValOpts.choices = rcpNames.omniOutPatch
				else if ((instance.config.model == 'PM' || instance.config.model == 'DM7') && rcpCmd.Index == 1000) {
					ValOpts = {...ValOpts,
						type: 'textinput',
						regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/',
					}
				} else {
					ValOpts = {...ValOpts,
						type: 'textinput',
						regex: '',
					}
				}
				paramsToAdd.push(ValOpts)
		}

		// Make sure the current value is stored in dataStore[]

		if (rcpCmd.Index < 1000 && rcpCmd.RW.includes('r')) {
			newAction.subscribe = async (action, context) => {
				let options = await instance.parseOptions(context, action.options)
				if (options != undefined) {
					let subscrAction = JSON.parse(JSON.stringify(options))
					subscrAction.Address = rcpCmd.Address
					instance.getFromDataStore(subscrAction)  // Make sure current values are in dataStore
				}
			}
		}

		newAction.options.push(...paramsToAdd)

		return newAction
	},

}
