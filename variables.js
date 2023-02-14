module.exports = {
	initVars: (instance) => {
		instance.variables = [
			{ variableId: 'modelName', name: 'Console Model Name' },
			{ variableId: 'curScene', name: 'Current Scene Number' },
			{ variableId: 'curSceneName', name: 'Current Scene Name' },
			{ variableId: 'curSceneComment', name: 'Current Scene Comment' },
			{ variableId: 'cuedInChannels', name: 'Inputs Cued' },
			{ variableId: 'cuedStInChannels', name: 'Stereo Inputs Cued' },
			{ variableId: 'cuedMixes', name: 'Mixes Cued' },
			{ variableId: 'cuedDCAs', name: 'DCAs Cued' },

		]
		instance.setVariableDefinitions(instance.variables)
	},

	// Get info from a connected console
	getVars: (instance) => {
		instance.sendCmd('devinfo productname') // Request Console Model
		if (instance.config.model == 'PM') {
			instance.sendCmd(`scpmode sstype "text"`) // Scene numbers are text on Rivage
			instance.sendCmd('sscurrentt_ex MIXER:Lib/Scene') // Request Current Scene Number
		} else {
			instance.sendCmd('sscurrent_ex MIXER:Lib/Scene')
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
				instance.setVariableValues({ curScene: msg.X })
				// Request Current Scene Info once we know what scene we have
				instance.sendCmd(`ssinfo_ex MIXER:Lib/Scene ${msg.X}`) 
				break
			case 'sscurrentt_ex':
				instance.setVariableValues({ curScene: msg.X })
				// Request Current Scene Info once we know what scene we have
				instance.sendCmd(`ssinfot_ex MIXER:Lib/Scene "${msg.X}"`)
				break
			case 'ssinfo_ex':
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
					case 'Cue/StIn/On':
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
				let chIdx = ch.indexOf(msg.X)
				if (msg.Val == 1) {
					if (chIdx == -1) {
						ch.push(msg.X)
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

	fbCreatesVar: (instance, cmd, options, data) => {
		let cmdName = cmd.rcpCmd.Address.slice(cmd.rcpCmd.Address.indexOf('/') + 1).replace(/\//g, '_')
		let varName = `V_${cmdName}`
		varName = varName + (cmd.options.X ? `_${cmd.options.X}` : '')
		varName = varName + (cmd.options.Y ? `_${cmd.options.Y}` : '')

		if (cmd.rcpCmd.Type == 'integer') {
			data = data == cmd.rcpCmd.Min ? '-Inf' : data / cmd.rcpCmd.Scale
		}

		// Auto-create a variable?
		let varToAdd = { variableId: varName, name: varName }
		let varIndex = instance.variables.findIndex((i) => i.variableId === varToAdd.variableId)

		if (!cmd.options.createVariable && varIndex != -1) {
			instance.variables.splice(varIndex, 1)
			instance.setVariableDefinitions(instance.variables)
		}

		if (cmd.options.createVariable) {
			if (varIndex == -1) {
				instance.variables.push(varToAdd)
				instance.setVariableDefinitions(instance.variables)
			}
			let value = {}
			value[varName] = data
			instance.setVariableValues(value)
			return true
		}

		// Set a custom variable?
		varName = options.Val
		const reg = /@\(([^:$)]+):custom_([^)$]+)\)/
		let matches = reg.exec(varName)
		if (matches) {
			instance.setCustomVariableValue(matches[2], data)
			return true
		}
		return false // no variable
	},
}
