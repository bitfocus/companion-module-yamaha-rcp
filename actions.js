module.exports = {
	// Create single Action/Feedback
	createAction: (instance, rcpCmd) => {
		const rcpNames = require('./rcpNames.json')
	
		let newAction = {}
		let paramsToAdd = []
		let rcpLabel = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"

		// Add the commands from the data file. Action id's (action.action) are the rcp command text (Address)
		let rcpLabels = rcpLabel.split('/')
		let rcpLabelIdx = rcpLabel.startsWith('Cue') ? 1 : 0

		newAction = { name: rcpLabel, options: [] }
				
		// X parameter - always an integer
		if (rcpCmd.X > 1) {
			if (rcpLabel.startsWith('InCh') || rcpLabel.startsWith('Cue/InCh')) {
				paramsToAdd.push({
					type: 'dropdown',
					label: rcpLabels[rcpLabelIdx],
					id: 'X',
					default: 1,
					minChoicesForSearch: 0,
					choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
					allowCustom: true,
				})
			} else {
				paramsToAdd.push({
					type: 'number',
					label: rcpLabels[rcpLabelIdx],
					id: 'X',
					min: 1,
					max: rcpCmd.X,
					default: 1,
					required: true,
					range: false,
				})
			}
			rcpLabelIdx++
		}

		// Y Parameter - always an integer
		if (rcpCmd.Y > 1) {
			if (instance.config.model == 'TF' && rcpCmd.Index == 1000) {
				paramsToAdd.push({
					type: 'dropdown',
					label: rcpLabels[rcpLabelIdx],
					id: 'Y',
					default: 1,
					choices: [
						{ id: 1, label: 'A' },
						{ id: 2, label: 'B' },
					],
					allowCustom: true
				})
			} else {
				paramsToAdd.push({
					type: 'textinput',
					label: rcpLabels[rcpLabelIdx],
					id: 'Y',
					default: '1',
					required: true,
					useVariables: true
				})
			}
		}

		if (rcpLabelIdx < rcpLabels.length - 1) {
			rcpLabelIdx++
		}


		// Val Parameter - integer, binary or string
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
						allowCustom: true
					})
				} else {
					paramsToAdd.push({
						type: 'textinput',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
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
				if (rcpLabel.startsWith('CustomFaderBank')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.customChNames,
					})
				} else if (rcpLabel.endsWith('Color')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: (instance.config.model == 'TF') ? rcpNames.chColorsTF : rcpNames.chColors,
					})
				} else if (rcpLabel.endsWith('Icon')) {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.chIcons,
					})
				} else if (rcpLabel == 'InCh/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.inChPatch,
					})
				} else if (rcpLabel == 'DanteOutPort/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.danteOutPatch,
					})
				} else if (rcpLabel == 'OmniOutPort/Patch') {
					paramsToAdd.push({
						type: 'dropdown',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						minChoicesForSearch: 0,
						choices: rcpNames.omniOutPatch,
					})
				} else if (instance.config.model == 'PM' && rcpCmd.Index == 1000) {
					paramsToAdd.push({
						type: 'textinput',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/',
						useVariables: true
					})
	
				} else {
					paramsToAdd.push({
						type: 'textinput',
						label: rcpLabels[rcpLabelIdx],
						id: 'Val',
						default: rcpCmd.Default,
						regex: '',
						useVariables: true
					})
				}
		}
		
		// Make sure the current value is stored in dataStore[]
		if (rcpCmd.Index != 1000) {
			newAction.subscribe = async (action) => {
				let req = (await module.exports.parseCmd(instance, 'get', action.actionId, action.options)).replace(
					'MIXER_',
					'MIXER:'
				)
				instance.sendCmd(req) // Get the current value
			}
		}

		newAction.options.push(...paramsToAdd)

		return newAction
	},

	// Create the proper command string for an action or poll
	parseCmd: async (instance, prefix, rcpCmd, opt) => {

console.log('\n\n\nparseCmd: rcpCmd (incoming) = \n', rcpCmd, 'opt: ', opt)

		if (rcpCmd == undefined || opt == undefined) return

		let rcpCommand = instance.rcpCommands.find((cmd) => cmd.Address == rcpCmd)
		if (rcpCommand == undefined) {
			instance.log('debug', `PARSECMD: Unrecognized command. '${rcpCmd}'`)
			return
		}
		let cmdStart = prefix
		let cmdName = rcpCommand.Address

		let optX = (opt.X == undefined) ? 1 : parseInt(await instance.parseVariablesInString(opt.X)) - 1
		let optY = (opt.Y == undefined) ? 0 : parseInt(await instance.parseVariablesInString(opt.Y)) - 1
		let optVal = await instance.parseVariablesInString(opt.Val)

console.log("\n\nrcpCommand (template) = \n", rcpCommand, '\n')
console.log('opt.X is ', opt.X, ', optX is ', optX)
console.log('opt.Y is ', opt.Y, ', optY is ', optY)
console.log('opt.Val is ',opt.Val, ', optVal is ', optVal, "\n\n")

		if (rcpCommand.Index == 1000) {

			switch (instance.config.model) {
				case 'TF':
					cmdName = `scene_${(optY == 0) ? 'a' : 'b'}`
				case 'CL/QL':
					cmdStart = (prefix == 'set') ? 'ssrecall_ex' : 'sscurrent_ex'
					break
				case 'PM':
					cmdStart = (prefix == 'set') ? 'ssrecallt_ex' : 'sscurrentt_ex'
			}

			optX = ''
			optY = ''
		}
		
		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set') {
			// if it's not "set" then it's a "get" which doesn't have a Value
			switch (rcpCommand.Type) {
				case 'integer':
				case 'binary':
					if (optVal == 'Toggle') {
						if (instance.dataStore[rcpCmd] !== undefined && instance.dataStore[rcpCmd][optX] !== undefined) {
							optVal = 1 - parseInt(instance.dataStore[rcpCmd][optX][optY + 1])
						}
					} else {
						optVal = parseInt(optVal)

						if (opt.Rel != undefined && opt.Rel == true) {
							// Relative selected?
							if (instance.dataStore[rcpCmd] !== undefined && instance.dataStore[rcpCmd][optX] !== undefined) {
								let curVal = parseInt(instance.dataStore[rcpCmd][optX][optY + 1])
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

					break

				case 'string':
					optVal = `"${optVal}"` // put quotes around the string
			}
		} else {
			optVal = ''
		}	

console.log(`\n\n\nFormatted Command: ${cmdStr} ${optX} ${optY} ${optVal}`.trim()) // Command string to send to console

		return `${cmdStr} ${optX} ${optY} ${optVal}`.trim() // Command string to send to console
	}
}
