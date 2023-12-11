module.exports = {
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
				fname = 'DM3 Parameters-1.txt'
				break
			case 'DM7':
				fname = 'DM7 Parameters-1.txt'
				break
			case 'RIO':
				fname = 'RIO Parameters-1.txt'
				break
			case 'TIO':
				fname = 'TIO Parameters-1.txt'
			
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
		const RCP_PARAM_DEF_FIELDS = ['Ok', 'Action', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale']
		const RCP_METER_DEF_FIELDS = ['Ok', 'Action', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale', 'Pickoff']
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

			if (line !== null && ['OK', 'OKM', 'NOTIFY'].indexOf(line[0].toUpperCase()) !== -1) {
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
		let options = {X: cmdToFmt.X, Y: cmdToFmt.Y, Val: cmdToFmt.Val}

		if (rcpCmd.Index >= 1000 && rcpCmd.Index < 1010) {
			cmdStart = (prefix == 'set') ? 'ssrecall' : 'sscurrent'
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

		if (rcpCmd.Index >= 1010 && rcpCmd.Index < 2000) { // RecallInc/Dec
			cmdStart = 'event'
			options.X = ''
			options.Y = ''
		}

		if (rcpCmd.Index >= 2000) { // Meters
			if (!config.metering) return
			cmdStart = 'mtrstart'
			cmdName = cmdName.replace('/Meter','') // Remove "Meter" from the beginning of the command
			if (config.model == 'TIO' || config.model == 'RIO') {
				cmdName = cmdName.replace(/\/.*Ch/, '/Dev')
			}
			if (rcpCmd.Pickoff) {
				let pickoffs = rcpCmd.Pickoff.split('|')
				cmdName += '/' + pickoffs[options.Y]  // Add the Pickoff Parameter
			}
			options.X = config.meterSpeed
			options.Y = ''
		}

		let cmdStr = `${cmdStart} ${cmdName}`
		if (prefix == 'set' && rcpCmd.Index < 1010) { // if it's not "set" then it's a "get" which doesn't have a Value, and RecallInc/Dec don't use a value
			if (rcpCmd.Type == 'string') {
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
			let parsedOptions = JSON.parse(JSON.stringify(optionsToParse))		// Deep Clone

			parsedOptions.X = optionsToParse.X == undefined ? 0 : parseInt(await context.parseVariablesInString(optionsToParse.X)) - 1
			parsedOptions.Y = optionsToParse.Y == undefined ? 0 : parseInt(await context.parseVariablesInString(optionsToParse.Y)) - 1

			if (!Number.isInteger(parsedOptions.X) || !Number.isInteger(parsedOptions.Y)) return // Don't go any further if not Integers for X & Y
			parsedOptions.X = Math.max(parsedOptions.X, 0)
			parsedOptions.Y = Math.max(parsedOptions.Y, 0)
			parsedOptions.Val = await context.parseVariablesInString(optionsToParse.Val)
			parsedOptions.Val = (parsedOptions.Val === undefined) ? '' : parsedOptions.Val
			
			return parsedOptions

		} catch(error) {
			this.log('error',`\nparseOptions: optionsToParse = ${JSON.stringify(optionsToParse)}`)
			this.log('error', `parseOptions: STACK TRACE:\n${error.stack}\n`)
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
			val = val - 126
		}

		if (rcpCmd.Type != 'bool') {
			if (isNaN(cmd.Val)) {
				if (cmd.Val.toUpperCase() == '-INF') val = rcpCmd.Min
			} else {
				val = parseInt(parseFloat(cmd.Val || '0') * rcpCmd.Scale)
			}
		}

		if (!module.exports.isRelAction(cmd)) return val
		
		let data = context.getFromDataStore(cmd)
		if (data === undefined) return undefined

		let curVal = parseInt(data)

		if (cmd.Val == 'Toggle') {
			val = 1 - curVal
			return val
		} 

		if (curVal <= -9000) { // Handle bottom of range
			if (cmd.Val < 0) val = -32768
			if (cmd.Val > 0) val = -6000
		} else {
			if (rcpCmd.Type != 'freq') {
				val = curVal + val	
			} else {
				const index = hpf.findIndex((f) => f == curVal)
				val = hpf[Math.min(Math.max(index + (val / rcpCmd.Scale), 0), hpf.length - 1)]
			}
		}
		val = Math.min(Math.max(val, rcpCmd.Min), rcpCmd.Max) // Clamp it

		return val
	},

	findRcpCmd: (cmdName) => {
		let rcpCmd = undefined
		if (cmdName != undefined) {
			rcpCmd = rcpCommands.find((cmd) => cmd.Address.replace(/:/g, '_').startsWith(cmdName.replace(/:/g, '_')))
		}
		return rcpCmd
	},

	isRelAction: (parsedCmd) => {
		if (parsedCmd.Val == 'Toggle' || (parsedCmd.Rel != undefined && parsedCmd.Rel == true)) { // Action that needs the current value from the device
			return true
		}
		return false
	}

}
