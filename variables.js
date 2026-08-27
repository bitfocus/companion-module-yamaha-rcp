import wtMtrTable from './wtMtrTable.json' with { type: 'json' }
import paramFuncs from './paramFuncs.js'

const varFuncs = {
	formatFeedbackValue: (cmd, data) => {
		const rcpCmd = paramFuncs.findRcpCmd(cmd.Address)
		if (rcpCmd.Type == 'mtr') {
			if (globalThis.config.model == 'DM7') {
				data = Math.round(wtMtrTable[data])
			} else {
				data = data - 126
			}
		}
		if (rcpCmd.Type == 'integer' || rcpCmd.Type == 'freq') {
			data = data == -32768 ? '-Inf' : data / rcpCmd.Scale
		}
		return data
	},

	initVars: (instance) => {
		instance.variables = {
			modelName: { name: 'Device Model Name' },
			deviceName: { name: 'Device Label' },
			runMode: { name: 'Device Run Mode' },
		}
		const addVariable = (variableId, name) => {
			instance.variables[variableId] = { name }
		}
		if (!['TF', 'DM3', 'DM7'].includes(globalThis.config.model)) {
			addVariable('error', 'Device Status')
		}

		if (globalThis.config.model.slice(-2) != 'IO') {
			// Not TIO, RIO or RSio
			addVariable('curScene', 'Current Scene Number')
			addVariable('curSceneName', 'Current Scene Name')
			addVariable('curSceneComment', 'Current Scene Comment')

			switch (globalThis.config.model) {
				case 'CL/QL':
					{
						addVariable('cuedInChannels', 'Inputs Cued')
						addVariable('cuedStInChannels', 'Stereo Inputs Cued')
						addVariable('cuedMixes', 'Mixes Cued')
						addVariable('cuedMatrices', 'Matrices Cued')
						addVariable('cuedDCAs', 'DCAs Cued')
					}
					break

				case 'DM3':
					{
						addVariable('cuedStInChannels', 'Stereo Inputs Cued')
						addVariable('cuedInChannels', 'Inputs Cued')
						addVariable('cuedMixes', 'Mixes Cued')
						addVariable('cuedMatrices', 'Matrices Cued')
					}
					break

				case 'PM': {
					addVariable('cuedInChannels', 'Inputs Cued')
					addVariable('cuedMixes', 'Mixes Cued')
					addVariable('cuedMatrices', 'Matrices Cued')
					addVariable('cuedDCAs', 'DCAs Cued')
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
		instance.sendCmd('devinfo devicename')  // Request Device Label
		instance.sendCmd('devstatus runmode')   // Request Run Mode
		if (!['TF', 'DM3', 'DM7'].includes(globalThis.config.model)) instance.sendCmd('devstatus error') // Request error status
		
		switch (globalThis.config.model) {
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
					case 'devicename':
						instance.setVariableValues({ deviceName: msg.Val })
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
				if (globalThis.config.model == 'TF' || globalThis.config.model == 'DM3') {
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
				switch (globalThis.config.model) {
					case 'PM':
						instance.sendCmd(`ssinfot_ex MIXER:Lib/Scene "${msg.Val}"`)
						break
					case 'DM3':
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
		let rcpCmd = paramFuncs.findRcpCmd(cmd.Address)

		if (rcpCmd.Type == 'mtr') {
			data = varFuncs.formatFeedbackValue(cmd, data)
			if (rcpCmd.Pickoff && cmd.Y > 0) {
				cmd.Y = rcpCmd.Pickoff.split('|')[cmd.Y - 1] || undefined
			}
		} else {
			data = varFuncs.formatFeedbackValue(cmd, data)
		}

		if (cmd.createVariable) {
			// Auto-create a variable

			let cmdName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1).replace(/\//g, '_')
			let varName = `V_${cmdName}`
			varName = varName + (cmd.X ? `_${cmd.X}` : '')
			varName = varName + (cmd.Y ? `_${cmd.Y}` : '')

			// Add new Auto-created variable and value
			if (instance.variables[varName] === undefined) {
				instance.variables[varName] = { name: 'Auto-Created Variable' }
				instance.setVariableDefinitions(instance.variables)
			}
			let value = {}
			value[varName] = data
			instance.setVariableValues(value)
		} else {

			const reg = /^@\(custom:([^)$]+)\)/
			let hasCustomVar = reg.exec(cmd.Val)
			if (hasCustomVar) {
				// Set a custom variable value using @ syntax
				instance.setCustomVariableValue(hasCustomVar[1], data)
			}
		}
	},
}

export default varFuncs
