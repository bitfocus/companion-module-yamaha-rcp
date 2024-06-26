module.exports = {
	initVars: (instance) => {
		instance.variables = [
			{ variableId: 'modelName', name: 'Device Model Name' },
			{ variableId: 'runMode', name: 'Device Run Mode' },
		]
		if (!['TF', 'DM3', 'DM7'].includes(config.model)) {
			instance.variables.push({ variableId: 'error', name: 'Device Status'})
		}

		if (config.model.slice(-2) != 'IO') {
			// Not TIO, RIO or RSio
			instance.variables.push(
				{ variableId: 'curScene', name: 'Current Scene Number' },
				{ variableId: 'curSceneName', name: 'Current Scene Name' },
				{ variableId: 'curSceneComment', name: 'Current Scene Comment' },
			)

			switch (config.model) {
				case 'CL/QL':
					{
						instance.variables.push(
							{ variableId: 'cuedInChannels', name: 'Inputs Cued' },
							{ variableId: 'cuedStInChannels', name: 'Stereo Inputs Cued' },
							{ variableId: 'cuedMixes', name: 'Mixes Cued' },
							{ variableId: 'cuedMatrices', name: 'Matrices Cued' },
							{ variableId: 'cuedDCAs', name: 'DCAs Cued' }
						)
					}
					break

				case 'DM3':
					{
						instance.variables.push(
							{ variableId: 'cuedStInChannels', name: 'Stereo Inputs Cued' },
							{ variableId: 'cuedInChannels', name: 'Inputs Cued' },
							{ variableId: 'cuedMixes', name: 'Mixes Cued' },
							{ variableId: 'cuedMatrices', name: 'Matrices Cued' }
						)
					}
					break

				case 'PM': {
					instance.variables.push(
						{ variableId: 'cuedInChannels', name: 'Inputs Cued' },
						{ variableId: 'cuedMixes', name: 'Mixes Cued' },
						{ variableId: 'cuedMatrices', name: 'Matrices Cued' },
						{ variableId: 'cuedDCAs', name: 'DCAs Cued' }
					)
				}
			}
		}

		instance.setVariableDefinitions(instance.variables)
		instance.setVariableValues({
			cuedStInChannels: '[]',
			cuedInChannels: '[]',
			cuedMixes: '[]',
			cuedMatrices: '[]',
			cuedDCAs: '[]',
		})
	},

	// Get info from a connected console
	getVars: (instance) => {
		instance.sendCmd('devinfo productname') // Request Device Model
		instance.sendCmd('devstatus runmode') // Request Run Mode
		if (!['TF', 'DM3', 'DM7'].includes(config.model)) instance.sendCmd('devstatus error') // Request error status
		
		switch (config.model) {
			case 'CL/QL': {
				instance.sendCmd('sscurrent_ex MIXER:Lib/Scene') // Request Current Scene Number
				break
			}
			case 'TF':
			case 'DM3': {
				instance.sendCmd('sscurrent_ex scene_a') // TF uses 2 "banks", with no way to determine which is active
				instance.sendCmd('sscurrent_ex scene_b') // except when asking for the opposite back, you'll get an error
				break
			}
			case 'PM': {
				instance.sendCmd(`scpmode sstype "text"`) // Scene numbers are text on Rivage
				instance.sendCmd('sscurrentt_ex MIXER:Lib/Scene')
				break
			}
			case 'DM7': {
				instance.sendCmd(`scpmode sstype "text"`) // Scene numbers are text on DM7
				instance.sendCmd('sscurrentt_ex scene_a')
				instance.sendCmd('sscurrentt_ex scene_b')
			}
		}
	},

	setVar: (instance, msg) => {
		switch (msg.Action) {
			case 'devinfo': {
				switch (msg.Address) {
					case 'productname':
						if (instance.getVariableValue('modelName') == '') {
							instance.log('info', `Device Model is ${msg.Val}`)
						}
						instance.setVariableValues({ modelName: msg.Val })
						break
				}
				break
			}
			case 'devstatus': {
				switch (msg.Address) {
					case 'runmode':
						instance.setVariableValues({ runMode: msg.Val })
						break
					case 'error':
						instance.setVariableValues({ error: msg.Val })
						break
				}
				break
			}
			case 'ssrecall_ex':
				break
			case 'sscurrent_ex':
				// Request Current Scene Info once we know what scene we have
				if (config.model == 'TF' || config.model == 'DM3') {
					instance.setVariableValues({
						curScene: `${msg.Address.toUpperCase().slice(-1)}${msg.Val.toString().padStart(2, '0')}`,
					})
					instance.sendCmd(`ssinfo_ex ${msg.Address} ${msg.Val}`)
				} else {
					instance.setVariableValues({ curScene: msg.Val })
					instance.sendCmd(`ssinfo_ex MIXER:Lib/Scene ${msg.Val}`)
				}
				break
			case 'sscurrentt_ex':
				instance.setVariableValues({ curScene: msg.Val })
				// Request Current Scene Info once we know what scene we have
				switch (config.model) {
					case 'PM':
						instance.sendCmd(`ssinfot_ex MIXER:Lib/Scene "${msg.Val}"`)
						break
					case 'DM7':
						instance.sendCmd(`ssinfot_ex ${msg.Address} ${msg.Val}`)
				}
				break
			case 'ssinfo_ex':
			case 'ssinfot_ex':
				instance.setVariableValues({ curSceneName: msg.ScnName })
				instance.setVariableValues({ curSceneComment: msg.ScnComment })
				break
			default: {
				let cmdName = msg.Address.slice(msg.Address.indexOf('/') + 1) // String after "MIXER:Current/"
				let varName = ''

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
					case 'Cue/Mtrx/On':
						varName = 'cuedMatrices'
						break
					case 'Cue/DCA/On':
						varName = 'cuedDCAs'
						break
					default:
						return
				}

				let ch = JSON.parse(instance.getVariableValue(varName) || '[]')
				let XBase1 = parseInt(msg.X) + 1 // Actual channel/Mix/DCA numbers starting at 1
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
		const paramFuncs = require('./paramFuncs.js')
		let rcpCmd = paramFuncs.findRcpCmd(cmd.Address)

		if (rcpCmd.Type == 'mtr') {
			data = data - 126
			if (rcpCmd.Pickoff && cmd.Y > 0) {
				cmd.Y = rcpCmd.Pickoff.split('|')[cmd.Y - 1] || undefined
			}
		}

		if (rcpCmd.Type == 'integer' || rcpCmd.Type == 'freq') {
			data = data == -32768 ? '-Inf' : data / rcpCmd.Scale
		}

		if (cmd.createVariable) {
			// Auto-create a variable

			let cmdName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1).replace(/\//g, '_')
			let varName = `V_${cmdName}`
			varName = varName + (cmd.X ? `_${cmd.X}` : '')
			varName = varName + (cmd.Y ? `_${cmd.Y}` : '')

			let varToAdd = { variableId: varName, name: 'Auto-Created Variable' }
			let varIndex = instance.variables.findIndex((i) => i.variableId === varToAdd.variableId)

			// Add new Auto-created variable and value
			if (varIndex == -1) {
				instance.variables.push(varToAdd)
				instance.setVariableDefinitions(instance.variables)
			}
			let value = {}
			value[varName] = data
			instance.setVariableValues(value)
		} else {
			const reg = /@\(([^:$)]+):custom_([^)$]+)\)/
			let hasCustomVar = reg.exec(cmd.Val)
			if (hasCustomVar) {
				// Set a custom variable value using @ syntax
				instance.setCustomVariableValue(hasCustomVar[2], data)
			}
		}
	},
}
