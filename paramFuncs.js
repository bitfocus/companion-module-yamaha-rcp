const DEFAULT_MAX_ACTIVE_FADES = 6
const DEFAULT_FADE_STEP_DURATION_MS = 40
const FADE_STEP_COALESCE_MS = 10
const FADER_MIN = -9000

const getMaxActiveFades = () =>
	Math.min(Math.max(parseInt(config.maxConcurrentFades || DEFAULT_MAX_ACTIVE_FADES), 1), 32)

const getBaseFadeStepDuration = () =>
	Math.min(Math.max(parseInt(config.fadeStepInterval || DEFAULT_FADE_STEP_DURATION_MS), 10), 500)

const getFadeLimitMode = () => {
	if (['cancel', 'queue', 'rateLimit'].includes(config.fadeLimitMode)) return config.fadeLimitMode
	return 'queue'
}

const getFadeStore = (instance) => {
	if (instance.fadeTimers == undefined) instance.fadeTimers = {}
	if (instance.fadeQueue == undefined) instance.fadeQueue = []
}

const activeFadeCount = (instance) => {
	getFadeStore(instance)
	return Object.values(instance.fadeTimers).filter((fade) => fade?.active).length
}

const startQueuedFades = (instance) => {
	getFadeStore(instance)

	while (activeFadeCount(instance) < getMaxActiveFades() && instance.fadeQueue.length > 0) {
		const fade = instance.fadeQueue.shift()
		if (instance.fadeTimers[fade.key] != undefined) {
			fade.start()
		}
	}
}

const getFadeStepDuration = (instance) => {
	const maxActiveFades = getMaxActiveFades()
	const fadeCount = activeFadeCount(instance)
	const rateLimitMultiplier = getFadeLimitMode() == 'rateLimit' ? Math.max(Math.ceil(fadeCount / maxActiveFades), 1) : 1
	return getBaseFadeStepDuration() * rateLimitMultiplier
}

module.exports = {
	createFadeOption: () => {
		return {
			type: 'dropdown',
			label: 'Fading',
			id: 'Fade',
			tooltip:
				'Recalling a scene from the console surface while Companion fades are running can cause unexpected fader movement. The module can cancel fades on scene changes, but avoid recalling scenes mid-fade where possible.',
			default: 0,
			choices: [
				{ id: 0, label: 'Off' },
				{ id: 1, label: '1s' },
				{ id: 2, label: '2s' },
				{ id: 3, label: '3s' },
				{ id: 5, label: '5s' },
				{ id: 10, label: '10s' },
			],
			minChoicesForSearch: 0,
		}
	},

	isLevel: (rcpCmd) => {
		return (
			rcpCmd !== undefined &&
			rcpCmd.Type == 'integer' &&
			rcpCmd.Unit == 'dB' &&
			parseInt(rcpCmd.Min) <= -32768 &&
			parseInt(rcpCmd.Max) == 1000 &&
			parseInt(rcpCmd.Scale) == 100 &&
			rcpCmd.Address.endsWith('/Level')
		)
	},

	isFaderLevel: (rcpCmd) => {
		return module.exports.isLevel(rcpCmd) && rcpCmd.Address.includes('/Fader/Level')
	},

	isSceneRecall: (rcpCmd) => {
		return rcpCmd !== undefined && rcpCmd.Index >= 1000 && rcpCmd.Index < 2000 && rcpCmd.Index != 1001
	},

	getSceneNameVariableName: (address, sceneNumber) => {
		return `scene_${String(address).replace(/[^a-zA-Z0-9]/g, '_')}_${String(sceneNumber).replace(/[^a-zA-Z0-9]/g, '_')}`
	},

	getBaseVariableName: (rcpCmd) => {
		return `V_${rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1).replace(/\//g, '_')}`
	},

	getIndexedVariableName: (rcpCmd, x, y) => {
		let varName = module.exports.getBaseVariableName(rcpCmd)
		if (parseInt(rcpCmd.X) > 1) varName += `_${parseInt(x) + 1}`
		if (parseInt(rcpCmd.Y) > 1) varName += `_${parseInt(y) + 1}`
		return varName
	},

	getFadeKey: (cmd) => `${cmd.Address}:${cmd.X ?? 0}:${cmd.Y ?? 0}`,

	cancelFade: (instance, cmd, startNextQueuedFade = true) => {
		if (instance.fadeTimers == undefined || cmd == undefined) return

		const fadeKey = module.exports.getFadeKey(cmd)
		const fade = instance.fadeTimers[fadeKey]
		if (fade != undefined) {
			clearTimeout(fade.timer)
			delete instance.fadeTimers[fadeKey]
		}
		if (instance.fadeQueue != undefined) {
			instance.fadeQueue = instance.fadeQueue.filter((queuedFade) => queuedFade.key != fadeKey)
		}
		if (startNextQueuedFade) startQueuedFades(instance)
	},

	cancelAllFades: (instance) => {
		getFadeStore(instance)
		for (const fade of Object.values(instance.fadeTimers)) {
			clearTimeout(fade?.timer)
		}
		instance.fadeTimers = {}
		instance.fadeQueue = []
	},

	makeChNames: (r) => {
		for (let i = 1; i <= 288; i++) {
			r.chNames.push({ id: i, label: `CH${i}` })
		}
		return r.chNames
	},

	getParams: (instance, cfg) => {
		var rcpNames = require('./rcpNames.json')
		rcpNames.chNames = module.exports.makeChNames(rcpNames)

		instance.colorCommands = []

		let fname = ''
		let rcpCmds
		const FS = require('fs')

		switch (cfg.model) {
			case 'CL/QL':
				fname = 'CLQL Parameters-1.txt'
				break
			case 'PM':
				fname = 'Rivage Parameters-3.txt'
				break
			case 'TF':
				fname = 'TF Parameters-1.txt'
				break
			case 'DM3':
				fname = 'DM3 Parameters-2.txt'
				break
			case 'DM7':
				fname = 'DM7 Parameters-2.txt'
				break
			case 'RIO':
				fname = 'RIO Parameters-1.txt'
				break
			case 'TIO':
				fname = 'TIO Parameters-1.txt'
				break
			case 'RSIO':
				fname = 'RSio Parameters-1.txt'
		}

		// Read the DataFile
		if (fname !== '') {
			let data = FS.readFileSync(`${__dirname}/${fname}`)
			rcpCmds = module.exports.parseData(data)

			rcpCmds.sort((a, b) => {
				// Sort the commands
				let acmd = a.Address.slice(a.Address.indexOf('/') + 1)
				let bcmd = b.Address.slice(b.Address.indexOf('/') + 1)
				return acmd.toLowerCase().localeCompare(bcmd.toLowerCase())
			})

			rcpCmds.forEach((cmd) => {
				let rcpName = cmd.Address.slice(cmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"
				if (rcpName.endsWith('Color')) {
					instance.colorCommands.push(rcpName)
				}
				if (cmd.Type == 'integer' && cmd.Max == 1) {
					cmd.Type = 'bool'
				}
			})
		}
		return rcpCmds
	},

	parseData: (data) => {
		const RCP_PARAM_DEF_FIELDS = [
			'Ok',
			'Action',
			'Index',
			'Address',
			'X',
			'Y',
			'Min',
			'Max',
			'Default',
			'Unit',
			'Type',
			'UI',
			'RW',
			'Scale',
		]
		const RCP_METER_DEF_FIELDS = [
			'Ok',
			'Action',
			'Index',
			'Address',
			'X',
			'Y',
			'Min',
			'Max',
			'Default',
			'Unit',
			'Type',
			'UI',
			'RW',
			'Scale',
			'Pickoff',
		]
		const RCP_PARAM_FIELDS = ['Status', 'Action', 'Address', 'X', 'Y', 'Val', 'TxtVal']
		const RCP_DEVINFO_FIELDS = ['Status', 'Action', 'Address', 'Val']
		const RCP_SCENE_FIELDS = ['Status', 'Action', 'Address', 'Val', 'ScnStatus']
		const RCP_SCNINFO_FIELDS = ['Status', 'Action', 'Address', 'Val', 'TxtVal', 'ScnName', 'ScnComment', 'ScnType']
		const RCP_METER_FIELDS = ['Status', 'Action', 'Address', 'Name']
		let cmds = []
		let line = []
		const lines = data.toString().split('\x0A')

		for (let i = 0; i < lines.length; i++) {
			// I'm not going to even try to explain this next line,
			// but it basically pulls out the space-separated values, except for spaces that are inside quotes!
			line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)

			if (line !== null && line.length > 1 && ['OK', 'OKM', 'NOTIFY'].indexOf(line[0].toUpperCase()) !== -1) {
				let rcpCommand = {}
				let params = RCP_PARAM_DEF_FIELDS

				switch (line[1].trim()) {
					case 'mtrinfo':
						params = RCP_METER_DEF_FIELDS
						break

					case 'set':
					case 'get':
					case 'mtrstart':
						params = RCP_PARAM_FIELDS
						break

					case 'devinfo':
					case 'devstatus':
					case 'scpmode':
						params = RCP_DEVINFO_FIELDS
						break

					case 'sscurrent_ex':
					case 'sscurrentt_ex':
					case 'ssrecall_ex':
					case 'ssrecallt_ex':
					case 'ssupdate_ex':
					case 'ssupdatet_ex':
					case 'event':
						params = RCP_SCENE_FIELDS
						break

					case 'ssinfo_ex':
					case 'ssinfot_ex':
						params = RCP_SCNINFO_FIELDS
						break

					case 'mtr':
						params = RCP_METER_FIELDS
						for (k = 3; k < line.length; k++) {
							params.push(k - 3)
						}
				}

				for (var j = 0; j < Math.min(line.length, params.length); j++) {
					rcpCommand[params[j]] = line[j].replace(/"/g, '').trim() // Add to rcpCommand object and get rid of any double quotes around the strings
				}

				cmds.push(rcpCommand)
			}
		}
		return cmds
	},

	// Create the proper command string to send to the device
	fmtCmd: (cmdToFmt) => {
		if (cmdToFmt == undefined) return

		let cmdName = cmdToFmt.Address
		let rcpCmd = module.exports.findRcpCmd(cmdName)
		let prefix = cmdToFmt.prefix
		let cmdStart = prefix
		let options = { X: cmdToFmt.X, Y: cmdToFmt.Y, Val: cmdToFmt.Val }

		if (rcpCmd.Index >= 1000 && rcpCmd.Index < 1010) {
			cmdStart = prefix == 'set' ? 'ssrecall' : 'sscurrent'
			if (rcpCmd.Index == 1001) cmdStart = 'ssupdate' // store command
			switch (config.model) {
				case 'TF':
				case 'DM3':
					cmdStart = cmdStart + '_ex'
					cmdName = `scene_${options.Y == 0 ? 'a' : 'b'}`
					break
				case 'CL/QL':
					cmdStart = cmdStart + '_ex'
					cmdName = 'MIXER:Lib/Scene'
					break
				case 'PM':
					cmdStart = cmdStart + 't_ex'
					cmdName = 'MIXER:Lib/Scene'
					break
				case 'DM7':
					cmdStart = cmdStart + 't_ex'
					cmdName = `scene_${options.Y == 0 ? 'a' : 'b'}`
			}
			options.X = ''
			options.Y = ''
		}

		if (rcpCmd.Index >= 1010 && rcpCmd.Index < 2000) {
			// RecallInc/Dec
			cmdStart = 'event'
			cmdName = cmdName.replace('/Bank', '') // Remove "Bank" from command
			options.X = ''
			options.Y = config.model == 'DM7' ? `scene_${options.Y == 0 ? 'a' : 'b'}` : ''
		}

		if (rcpCmd.Index >= 2000) {
			// Meters
			if (!config.metering) return
			cmdStart = 'mtrstart'
			cmdName = cmdName.replace('/Meter', '') // Remove "Meter" from the beginning of the command
			if (config.model == 'TIO' || config.model == 'RIO' || config.model == 'RSIO') {
				cmdName = cmdName.replace(/\/.*Ch/, '/Dev')
			}
			if (rcpCmd.Pickoff) {
				let pickoffs = rcpCmd.Pickoff.split('|')
				cmdName += '/' + pickoffs[options.Y] // Add the Pickoff Parameter
			}
			options.X = config.meterSpeed
			options.Y = ''
		}

		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set' && rcpCmd.Index < 1010) {
			// if it's not "set" then it's a "get" which doesn't have a Value, and RecallInc/Dec don't use a value
			if (rcpCmd.Type == 'string' || rcpCmd.Type == 'binary') {
				options.Val = `"${options.Val}"` // put quotes around the string
			}
		} else {
			options.Val = '' // "get" command, so no Value
		}

		return `${cmdStr} ${options.X} ${options.Y} ${options.Val}`.trim() // Command string to send to device
	},

	// Create the proper command string for an action or feedback
	parseOptions: async (context, optionsToParse) => {
		try {
			let parsedOptions = JSON.parse(JSON.stringify(optionsToParse)) // Deep Clone

			parsedOptions.X =
				optionsToParse.X == undefined ? 0 : parseInt(String(optionsToParse.X)) - 1
			parsedOptions.Y =
				optionsToParse.Y == undefined ? 0 : parseInt(String(optionsToParse.Y)) - 1

			if (!Number.isInteger(parsedOptions.X) || !Number.isInteger(parsedOptions.Y)) return // Don't go any further if not Integers for X & Y
			parsedOptions.X = Math.max(parsedOptions.X, 0)
			parsedOptions.Y = Math.max(parsedOptions.Y, 0)
			parsedOptions.Val = String(optionsToParse.Val ?? '')
			parsedOptions.Val = parsedOptions.Val === undefined ? '' : parsedOptions.Val

			return parsedOptions
		} catch (error) {
			if (typeof context.log === 'function') {
				context.log('error', `\nparseOptions: optionsToParse = ${JSON.stringify(optionsToParse)}`)
				context.log('error', `parseOptions: STACK TRACE:\n${error.stack}\n`)
			} else {
				console.error(`\nparseOptions: optionsToParse = ${JSON.stringify(optionsToParse)}`)
				console.error(`parseOptions: STACK TRACE:\n${error.stack}\n`)
			}
		}
	},

	parseVal: (context, cmd) => {
		const hpf = require('./hpf')
		let val = cmd.Val
		let rcpCmd = module.exports.findRcpCmd(cmd.Address)

		if (rcpCmd.Type == 'string' || rcpCmd.Type == 'binary') {
			return val
		}

		if (rcpCmd.Type == 'mtr') {
			if (!isNaN(cmd.Val)) {
				val = parseInt(cmd.Val) + 126
			}
			return val
		}

		if (rcpCmd.Type != 'bool') {
			if (isNaN(cmd.Val)) {
				if (cmd.Val.toUpperCase() == '-INF') val = rcpCmd.Min
			} else {
				val = parseInt(parseFloat(cmd.Val || '0') * rcpCmd.Scale)
			}
		}

		if (!module.exports.isRelAction(cmd)) return val //Only continue if it's a relative action

		let data = context.getFromDataStore(cmd)
		if (data === undefined) return undefined

		let curVal = parseInt(data)

		if (cmd.Val == 'Toggle') {
			val = 1 - curVal
			return val
		}

		if (curVal <= -9000) {
			// Handle bottom of range
			if (cmd.Val < 0) val = -32768
			if (cmd.Val > 0) val = -6000
		} else {
			if (rcpCmd.Type != 'freq') {
				val = curVal + val
			} else {
				const index = hpf.findIndex((f) => f == curVal)
				val = hpf[Math.min(Math.max(index + val / rcpCmd.Scale, 0), hpf.length - 1)]
			}
		}
		val = Math.min(Math.max(val, rcpCmd.Min), rcpCmd.Max) // Clamp it

		return val
	},

	fadeCmd: (instance, cmd) => {
		let rcpCmd = module.exports.findRcpCmd(cmd.Address)
		if (!module.exports.isLevel(rcpCmd)) {
			module.exports.cancelFade(instance, cmd)
			instance.addToCmdQueue(cmd)
			return
		}
		const toDisplayValue = (value) => (value <= parseInt(rcpCmd.Min) ? '-Inf' : value / parseInt(rcpCmd.Scale))

		let fadeTimeMs = Number(cmd.Fade || 0) * 1000
		if (!(fadeTimeMs > 0)) {
			module.exports.cancelFade(instance, cmd)
			instance.addToCmdQueue(cmd)
			return
		}

		let start = instance.getFromDataStore(cmd)
		if (start === undefined) {
			instance.log('warn', `Cannot fade ${cmd.Address}; current value is not available yet`)
			return
		}

		let end = module.exports.parseVal(instance, cmd)
		if (end === undefined) {
			return
		}

		start = parseInt(start)
		end = parseInt(end)
		if (isNaN(start) || isNaN(end)) {
			instance.log('warn', `Cannot fade ${cmd.Address}; start or end value is not numeric`)
			return
		}

		if (start == end) {
			fadeTimeMs = 0
		}

		if (fadeTimeMs <= FADE_STEP_COALESCE_MS) {
			const endCmd = { ...cmd, Val: toDisplayValue(end), Rel: false }
			instance.addToCmdQueue(endCmd)
			return
		}

		const numericStart = Math.max(start, FADER_MIN)
		const numericEnd = Math.max(end, FADER_MIN)
		const totalLevelChange = numericEnd - numericStart
		let elapsedMs = 0
		getFadeStore(instance)
		const fadeKey = module.exports.getFadeKey(cmd)
		module.exports.cancelFade(instance, cmd, false)

		const step = () => {
			const fade = instance.fadeTimers[fadeKey]
			if (fade == undefined) return

			if (elapsedMs >= fadeTimeMs) {
				const endCmd = { ...cmd, Val: toDisplayValue(end), Rel: false }
				instance.addToCmdQueue(endCmd)
				delete instance.fadeTimers[fadeKey]
				startQueuedFades(instance)
				return
			}

			const fadeStepDurationMs = getFadeStepDuration(instance)
			const nextStepDeltaMs =
				elapsedMs + fadeStepDurationMs + FADE_STEP_COALESCE_MS > fadeTimeMs
					? fadeTimeMs - elapsedMs
					: fadeStepDurationMs
			const level = Math.round(numericStart + totalLevelChange * ((elapsedMs + nextStepDeltaMs / 2) / fadeTimeMs))
			const stepCmd = {
				...cmd,
				Val: toDisplayValue(Math.min(Math.max(level, parseInt(rcpCmd.Min)), parseInt(rcpCmd.Max))),
				Rel: false,
			}
			instance.addToCmdQueue(stepCmd)

			fade.timer = setTimeout(() => {
				elapsedMs += nextStepDeltaMs
				step()
			}, nextStepDeltaMs)
		}

		const startFade = () => {
			instance.fadeTimers[fadeKey] = {
				active: true,
				timer: undefined,
			}
			step()
		}

		const fadeLimitMode = getFadeLimitMode()
		if (activeFadeCount(instance) < getMaxActiveFades() || fadeLimitMode == 'rateLimit') {
			startFade()
		} else if (fadeLimitMode == 'cancel') {
			instance.log(
				'warn',
				`Cannot fade ${cmd.Address}; maximum of ${getMaxActiveFades()} active fades is already running`,
			)
		} else {
			instance.fadeTimers[fadeKey] = {
				active: false,
				timer: undefined,
			}
			instance.fadeQueue.push({
				key: fadeKey,
				start: startFade,
			})
		}
	},

	findRcpCmd: (cmdName, cmdAction = '') => {
		let rcpCmd = undefined
		if (cmdName != undefined) {
			if (cmdAction == 'mtr') {
				cmdName = cmdName.replace('Current/', 'Current/Meter/')

				if (config.model == 'TIO' || config.model == 'RIO') {
					cmdName = cmdName.replace('/Dev/OutputLevel', '/OutCh/OutputLevel')
					cmdName = cmdName.replace(/\/Dev.*/, config.model == 'TIO' ? '/InCh/InputLevel' : '/InCh')
				} else if (config.model == 'RSIO') {
					cmdName = cmdName.replace('/Dev', cmdName.includes('InputLevel') ? '/InCh' : '/OutCh')
				} else {
					let lastSlash = cmdName.lastIndexOf('/')
					cmdName = cmdName.slice(0, lastSlash)
				}
			}
			let cmdToFind = cmdName.replace(/:/g, '_')
			rcpCmd = rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_').startsWith(cmdToFind))
		}
		return rcpCmd
	},

	isRelAction: (parsedCmd) => {
		if (parsedCmd.Val == 'Toggle' || (parsedCmd.Rel != undefined && parsedCmd.Rel == true)) {
			// Action that needs the current value from the device
			return true
		}
		return false
	},
}
