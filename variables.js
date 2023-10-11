module.exports = {
	initVars: (instance) => {
		instance.variables = [
			{ variableId: 'modelName', name: 'Console Model Name' },
			{ variableId: 'curScene', name: 'Current Scene Number' },
			{ variableId: 'curSceneName', name: 'Current Scene Name' },
			{ variableId: 'curSceneComment', name: 'Current Scene Comment' },
		]
		switch (instance.config.model) {
			case 'CL/QL': {
				instance.variables.push(
					{ variableId: 'cuedStInChannels', name: 'Stereo Inputs Cued' }
				)
			}			
			case 'PM': {
				instance.variables.push(
					{ variableId: 'cuedInChannels', name: 'Inputs Cued' },
					{ variableId: 'cuedMixes', name: 'Mixes Cued' },
					{ variableId: 'cuedDCAs', name: 'DCAs Cued' }
				)
			}
		}
		instance.setVariableDefinitions(instance.variables)
		instance.setVariableValues({ cuedStInChannels: '[]', cuedInChannels: '[]', cuedMixes: '[]', cuedDCAs: '[]' })
	},

	// Get info from a connected console
	getVars: (instance) => {
		instance.sendCmd('devinfo productname') // Request Console Model
		switch (instance.config.model) {
			case 'CL/QL': {
				instance.sendCmd('sscurrent_ex MIXER:Lib/Scene') 	// Request Current Scene Number
				break
			}
			case 'TF': 
			case 'DM3': {
				instance.sendCmd('sscurrent_ex scene_a')			// TF uses 2 "banks", with no way to determine which is active
				instance.sendCmd('sscurrent_ex scene_b')			// except when asking for the opposite back, you'll get an error
				break
			}
			case 'PM': {
				instance.sendCmd(`scpmode sstype "text"`) 			// Scene numbers are text on Rivage
				instance.sendCmd('sscurrentt_ex MIXER:Lib/Scene')
				break
			}
			case 'DM7': {
				instance.sendCmd(`scpmode sstype "text"`) 			// Scene numbers are text on DM7
				instance.sendCmd('sscurrentt_ex scene_a')
				instance.sendCmd('sscurrentt_ex scene_b')
			}
		}
	},

	setVar: (instance, msg) => {
		switch (msg.Command) {
			case 'devinfo': {
				switch (msg.Address) {
					case 'productname':
						if (instance.getVariableValue('modelName') == '') {
							instance.log('info', `Console Model is ${msg.X}`)
						}
						instance.setVariableValues({ modelName: msg.X })
						break
				}
				break
			}
			case 'ssrecall_ex':
				break
			case 'sscurrent_ex':
				// Request Current Scene Info once we know what scene we have
				if (instance.config.model == 'TF') {
					instance.setVariableValues({ curScene: `${ msg.Address.toUpperCase().slice(-1) }${ msg.X.toString().padStart(2, "0") }`})
					instance.sendCmd(`ssinfo_ex ${msg.Address} ${msg.X }`)
				} else {
					instance.setVariableValues({ curScene: msg.X })
					instance.sendCmd(`ssinfo_ex MIXER:Lib/Scene ${msg.X }`)
				}
				break
			case 'sscurrentt_ex':
				instance.setVariableValues({ curScene: msg.X })
				// Request Current Scene Info once we know what scene we have
				switch (instance.config.model) {
					case 'PM':
						instance.sendCmd(`ssinfot_ex MIXER:Lib/Scene "${ msg.X }"`)
						break
					case 'DM7':
						instance.sendCmd(`ssinfot_ex ${msg.Address} ${ msg.X }`)
				}
				break
			case 'ssinfo_ex':
			case 'ssinfot_ex':
				instance.setVariableValues({ curSceneName: msg.Val.trim() })
				instance.setVariableValues({ curSceneComment: msg.TxtVal.trim() })
				break
			default: {
				let cmdName = msg.Address.slice(msg.Address.indexOf('/') + 1) // String after "MIXER:Current/"
				let varName = ""

				switch (cmdName) {
					case 'Cue/InCh/On':
						varName = 'cuedInChannels'
						break
					case 'Cue/StInCh/On':
						varName = 'cuedStInChannels'
						break
					case 'Cue/Mix/On':
						varName = 'cuedMixes'
						break
					case 'Cue/DCA/On':
						varName = 'cuedDCAs'
						break
					default:
						return
				}

				let ch = JSON.parse(instance.getVariableValue(varName) || '[]')
				let XBase1 = parseInt(msg.X) + 1	// Actual channel/Mix/DCA numbers starting at 1
				let chIdx = ch.indexOf(XBase1)
				if (msg.Val == 1) {
					if (chIdx == -1) {
						ch.push(XBase1)
					}
				} else {
					if (chIdx > -1) {
						ch.splice(chIdx, 1) || []
					}
				}
				let varN = {}
				varN[varName] = JSON.stringify(ch)
				instance.setVariableValues(varN)
			}
		}
	},

	fbCreatesVar: (instance, cmd, data) => {
		let rcpCmd = instance.findRcpCmd(cmd.Address)
	
		let cmdName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1).replace(/\//g, '_')
		let varName = `V_${cmdName}`
		varName = varName + (cmd.X ? `_${cmd.X}` : '')
		varName = varName + (cmd.Y ? `_${cmd.Y}` : '')

		if (rcpCmd.Type == 'integer') {
			data = data == rcpCmd.Min ? '-Inf' : data / rcpCmd.Scale
		}

		// Auto-create a variable?
		let varToAdd = { variableId: varName, name: varName }
		let varIndex = instance.variables.findIndex((i) => i.variableId === varToAdd.variableId)

		// Add new Auto-created variable and value
		if (cmd.createVariable) {
			if (varIndex == -1) {
				instance.variables.push(varToAdd)
				instance.setVariableDefinitions(instance.variables)
			}
			let value = {}
			value[varName] = data
			instance.setVariableValues(value)
			return true
		}

		// Set a custom variable value using @ syntax?
		varName = cmd.Val
		const reg = /@\(([^:$)]+):custom_([^)$]+)\)/
		let matches = reg.exec(varName)
		if (matches) {
			instance.setCustomVariableValue(matches[2], data)
			return true
		}
		return false // no variable
	},
}
