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
			if (actionName.startsWith('InCh') || actionName.startsWith('OutCh') || actionName.startsWith('Cue/InCh')) {
				paramsToAdd.push({
					type: 'dropdown',
					label: actionNameParts[rcpNameIdx],
					id: 'X',
					default: 1,
					minChoicesForSearch: 0,
					choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
					allowCustom: true,
				})
			} else {
				paramsToAdd.push({
					type: 'textinput',
					label: actionNameParts[rcpNameIdx],
					id: 'X',
					default: 1,
					required: true,
					useVariables: true,
				})
			}
			rcpNameIdx++
		}

		// Y Parameter - always an integer
		if (rcpCmd.Y > 1) {
			if (actionNameParts[rcpNameIdx] == 'PEQ') {
				rcpNameIdx++
			}
			
			if ((instance.config.model == 'TF' || instance.config.model == 'DM3' || instance.config.model == 'DM7') && rcpCmd.Index == 1000) {
				paramsToAdd.push({
					type: 'dropdown',
					label: actionNameParts[rcpNameIdx],
					id: 'Y',
					default: 1,
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
					allowCustom: true,
				})
			} else if (actionNameParts[0] == "Cue") {
				paramsToAdd.push({
					type: 'dropdown',
					label: 'Cue Bus',
					id: 'Y',
					default: 1,
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
					allowCustom: true,
				})
			} else {
				paramsToAdd.push({
					type: 'textinput',
					label: actionNameParts[rcpNameIdx],
					id: 'Y',
					default: '1',
					required: true,
					useVariables: true,
				})
			}
		}

		if (rcpNameIdx < actionNameParts.length - 1) {
			rcpNameIdx++
		}

		// Val Parameter - integer, binary or string
		switch (rcpCmd.Type) {
			case 'bool':
				paramsToAdd.push({
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
					allowCustom: true,
				})
				break

			case 'integer':
			case 'freq':
				if (rcpCmd.Max != 0 || rcpCmd.Min != 0) {
					paramsToAdd.push({
						type: 'textinput',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default == -32768 ? '-Inf' : rcpCmd.Default / rcpCmd.Scale,
						required: true,
						useVariables: true,
					})
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
				if (actionName.startsWith('CustomFaderBank')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.customChNames,
					})
				} else if (actionName.endsWith('Color')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: instance.config.model == 'TF' ? rcpNames.chColorsTF : rcpNames.chColors,
						allowCustom: true,
					})
				} else if (actionName.endsWith('Icon')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.chIcons,
						allowCustom: true,
					})
				} else if (actionName == 'InCh/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.inChPatch,
					})
				} else if (actionName == 'DanteOutPort/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.danteOutPatch,
					})
				} else if (actionName == 'OmniOutPort/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.omniOutPatch,
					})
				} else if ((instance.config.model == 'PM' || instance.config.model == 'DM7') && rcpCmd.Index == 1000) {
					paramsToAdd.push({
						type: 'textinput',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/',
						useVariables: true,
					})
				} else {
					paramsToAdd.push({
						type: 'textinput',
						label: actionNameParts[rcpNameIdx],
						id: 'Val',
						default: rcpCmd.Default,
						regex: '',
						useVariables: true,
					})
				}
		}

		// Make sure the current value is stored in dataStore[]
		if (rcpCmd.Index < 1000 && rcpCmd.RW.includes('r')) {
			newAction.subscribe = async (action) => {
				let options = await instance.parseOptions(instance, instance, { rcpCmd: rcpCmd, options: action.options })
				instance.getFromDataStore({ Address: rcpCmd.Address, options: options })  // Make sure current values are in dataStore
			}
		}

		newAction.options.push(...paramsToAdd)

		return newAction
	},

}
