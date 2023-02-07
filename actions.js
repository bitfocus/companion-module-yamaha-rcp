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
			if (actionName.startsWith('InCh') || actionName.startsWith('Cue/InCh')) {
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
			if (instance.config.model == 'TF' && rcpCmd.Index == 1000) {
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
		if (!(rcpCmd.Min == 0 && rcpCmd.Max == 0)) {
			// If Min & Max are both 0 then it has no value parameter
			switch (rcpCmd.Type) {
				case 'integer':
					if (rcpCmd.Max == 1) {
						// Boolean
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
					} else {
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
						})
					} else if (actionName.endsWith('Icon')) {
						paramsToAdd.push({
							type: 'dropdown',
							label: actionNameParts[rcpNameIdx],
							id: 'Val',
							default: rcpCmd.Default,
							minChoicesForSearch: 0,
							choices: rcpNames.chIcons,
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
					} else if (instance.config.model == 'PM' && rcpCmd.Index == 1000) {
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
		}

		// Make sure the current value is stored in dataStore[]
		if (rcpCmd.Index < 1000) {
			newAction.subscribe = async (action) => {
				let options = await module.exports.parseOptions(instance, instance, { rcpCmd: rcpCmd, options: action.options })
				await instance.getFromDataStore({ Address: rcpCmd.Address, options: options })
			}
		}

		newAction.options.push(...paramsToAdd)

		return newAction
	},

	// Create the proper command string to send to the console
	fmtCmd: async (instance, prefix, cmdToFmt) => {
		if (cmdToFmt == undefined) return

		let cmdStart = prefix
		let cmdName = cmdToFmt.rcpCmd.Address
		let options = await module.exports.parseOptions(instance, instance, cmdToFmt)

		if (cmdToFmt.rcpCmd.Index == 1000) {
			cmdName = 'MIXER:Lib/Scene'
			switch (instance.config.model) {
				case 'TF':
					cmdName = `scene_${options.Y == 0 ? 'a' : 'b'}`
				case 'CL/QL':
					cmdStart = prefix == 'set' ? 'ssrecall_ex' : 'sscurrent_ex'
					break
				case 'PM':
					cmdStart = prefix == 'set' ? 'ssrecallt_ex' : 'sscurrentt_ex'
			}
			options.X = ''
			options.Y = ''
		}

		if (cmdToFmt.rcpCmd.Index > 1000) {
			cmdStart = 'event'
			options.X = ''
			options.Y = ''
		}

		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set' && cmdToFmt.rcpCmd.Index <= 1000) {
			// if it's not "set" then it's a "get" which doesn't have a Value
			if (cmdToFmt.rcpCmd.Type == 'string') {
				options.Val = `"${options.Val}"` // put quotes around the string
			}
		} else {
			options.Val = '' // "get" command, so no Value
		}
		//	console.log(`fmtCmd: Formatted String = ${cmdStr} ${options.X} ${options.Y} ${options.Val}`.trim())
		return `${cmdStr} ${options.X} ${options.Y} ${options.Val}`.trim() // Command string to send to console
	},

	// Create the proper command string for an action or poll
	parseOptions: async (instance, context, cmdToParse) => {
		const varFuncs = require('./variables.js')
		let parsedOptions = {}
		parsedOptions.X = cmdToParse.options.X == undefined ? 0 : parseInt(await context.parseVariablesInString(cmdToParse.options.X)) - 1
		parsedOptions.Y = cmdToParse.options.Y == undefined ? 0 : parseInt(await context.parseVariablesInString(cmdToParse.options.Y)) - 1
		parsedOptions.Val = await context.parseVariablesInString(cmdToParse.options.Val)
		parsedOptions.X = Math.max(parsedOptions.X, 0)
		parsedOptions.Y = Math.max(parsedOptions.Y, 0)

		let data = await instance.getFromDataStore({ Address: cmdToParse.rcpCmd.Address, options: parsedOptions })

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
	},
}
