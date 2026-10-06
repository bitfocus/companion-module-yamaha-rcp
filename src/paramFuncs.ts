import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import rcpNames from '../rcpNames.json' with { type: 'json' }
import hpf from '../hpf.json' with { type: 'json' }

const moduleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const paramFuncs = {
	makeChNames: (r) => {
		for (let i = 1; i <= 288; i++) {
			r.chNames.push({ id: i, label: `CH${i}` })
		}
		return r.chNames
	},

	getParams: (instance, cfg) => {
		rcpNames.chNames = paramFuncs.makeChNames(rcpNames)

		instance.colorCommands = []

		let fname = ''
		let rcpCmds

		switch (cfg.model) {
			case 'CL/QL':
				fname = 'CLQL Parameters-1.txt'
				break
			case 'PM':
				fname = 'Rivage Parameters-4.txt'
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
			const data = fs.readFileSync(path.join(moduleDir, 'schemas', fname))
			rcpCmds = paramFuncs.parseData(data)

			rcpCmds.sort((a, b) => {
				// Sort the commands
				const acmd = a.Address.slice(a.Address.indexOf('/') + 1)
				const bcmd = b.Address.slice(b.Address.indexOf('/') + 1)
				return acmd.toLowerCase().localeCompare(bcmd.toLowerCase())
			})

			rcpCmds.forEach((cmd) => {
				const rcpName = cmd.Address.slice(cmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"
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
		const cmds = []
		const lines = data.toString().split('\x0A')

		for (let i = 0; i < lines.length; i++) {
			// I'm not going to even try to explain this next line,
			// but it basically pulls out the space-separated values, except for spaces that are inside quotes!
			const line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)

			if (line !== null && line.length > 1 && ['OK', 'OKM', 'NOTIFY'].indexOf(line[0].toUpperCase()) !== -1) {
				const rcpCommand = {}
				let params: Array<string | number> = RCP_PARAM_DEF_FIELDS

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
						for (let k = 3; k < line.length; k++) {
							params.push(k - 3)
						}
				}

				for (let j = 0; j < Math.min(line.length, params.length); j++) {
					rcpCommand[params[j]] = line[j].replace(/"/g, '').trim() // Add to the command object and remove double quotes
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
		const rcpCmd = paramFuncs.findRcpCmd(cmdName)
		const prefix = cmdToFmt.prefix
		let cmdStart = prefix
		const options = { X: cmdToFmt.X, Y: cmdToFmt.Y, Val: cmdToFmt.Val }

		if (rcpCmd.Index >= 1000 && rcpCmd.Index < 1010) {
			cmdStart = prefix == 'set' ? 'ssrecall' : 'sscurrent'
			if (rcpCmd.Index == 1001) cmdStart = 'ssupdate' // store command
			switch (globalThis.config.model) {
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
			options.Y = globalThis.config.model == 'DM7' ? `scene_${options.Y == 0 ? 'a' : 'b'}` : ''
		}

		if (rcpCmd.Index >= 2000) {
			// Meters
			if (!globalThis.config.metering) return
			cmdStart = 'mtrstart'
			cmdName = cmdName.replace('/Meter', '') // Remove "Meter" from the beginning of the command
			if (globalThis.config.model == 'TIO' || globalThis.config.model == 'RIO' || globalThis.config.model == 'RSIO') {
				cmdName = cmdName.replace(/\/.*Ch/, '/Dev')
			}
			if (rcpCmd.Pickoff) {
				const pickoffs = rcpCmd.Pickoff.split('|')
				cmdName += '/' + pickoffs[options.Y] // Add the Pickoff Parameter
			}
			options.X = globalThis.config.meterSpeed
			options.Y = ''
		}

		const cmdStr = `${cmdStart} ${cmdName}`
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
			const parsedOptions = JSON.parse(JSON.stringify(optionsToParse)) // Deep Clone

			parsedOptions.X = optionsToParse.X == undefined ? 0 : parseInt(String(optionsToParse.X)) - 1
			parsedOptions.Y = optionsToParse.Y == undefined ? 0 : parseInt(String(optionsToParse.Y)) - 1

			if (!Number.isInteger(parsedOptions.X) || !Number.isInteger(parsedOptions.Y)) return // Stop if X or Y is not an integer
			parsedOptions.X = Math.max(parsedOptions.X, 0)
			parsedOptions.Y = Math.max(parsedOptions.Y, 0)
			parsedOptions.Val = String(optionsToParse.Val)
			parsedOptions.Val = parsedOptions.Val === undefined ? '' : parsedOptions.Val

			return parsedOptions
		} catch (error) {
			console.error(`\nparseOptions: optionsToParse = ${JSON.stringify(optionsToParse)}`)
			console.error(`parseOptions: STACK TRACE:\n${error.stack}\n`)
		}
	},

	parseVal: (context, cmd) => {
		let val = cmd.Val
		const rcpCmd = paramFuncs.findRcpCmd(cmd.Address)

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
				val = parseInt(String(parseFloat(String(cmd.Val || '0')) * rcpCmd.Scale))
			}
		}

		if (!paramFuncs.isRelAction(cmd)) return val //Only continue if it's a relative action

		const data = context.getFromDataStore(cmd)
		if (data === undefined) return undefined

		const curVal = parseInt(data)

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

	findRcpCmd: (cmdName, cmdAction = '') => {
		let rcpCmd = undefined
		if (cmdName != undefined) {
			if (cmdAction == 'mtr') {
				cmdName = cmdName.replace('Current/', 'Current/Meter/')

				if (globalThis.config.model == 'TIO' || globalThis.config.model == 'RIO') {
					cmdName = cmdName.replace('/Dev/OutputLevel', '/OutCh/OutputLevel')
					cmdName = cmdName.replace(/\/Dev.*/, globalThis.config.model == 'TIO' ? '/InCh/InputLevel' : '/InCh')
				} else if (globalThis.config.model == 'RSIO') {
					cmdName = cmdName.replace('/Dev', cmdName.includes('InputLevel') ? '/InCh' : '/OutCh')
				} else {
					const lastSlash = cmdName.lastIndexOf('/')
					cmdName = cmdName.slice(0, lastSlash)
				}
			}
			const cmdToFind = cmdName.replace(/:/g, '_')
			rcpCmd = globalThis.rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_').startsWith(cmdToFind))
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

export default paramFuncs
