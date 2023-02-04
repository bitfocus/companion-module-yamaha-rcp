module.exports = {
	makeChNames: (r) => {
		for (let i = 1; i <= 288; i++) {
			r.chNames.push({ id: i, label: `CH${i}` })
		}
		return r.chNames
	},

	getParams: (instance) => {
		const RCP_PARAMS = [
			'Ok',
			'Command',
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
		var rcpNames = require('./rcpNames.json')
		rcpNames.chNames = module.exports.makeChNames(rcpNames)

		instance.colorCommands = []

		let fname = ''
		let rcpCommands
		const FS = require('fs')

		switch (instance.config.model) {
			case 'CL/QL':
				fname = 'CLQL Parameters-1.txt'
				break
			case 'TF':
				fname = 'TF Parameters-1.txt'
				break
			case 'PM':
				fname = 'Rivage Parameters-2.txt'
		}

		// Read the DataFile
		console.log('Yamaha-RCP: getParams: Getting parameters from file: ', fname)
		if (fname !== '') {
			let data = FS.readFileSync(`${__dirname}/${fname}`)
			rcpCommands = module.exports.parseData(instance, data, RCP_PARAMS)

			rcpCommands.sort((a, b) => {
				// Sort the commands
				let acmd = a.Address.slice(a.Address.indexOf('/') + 1)
				let bcmd = b.Address.slice(b.Address.indexOf('/') + 1)
				return acmd.toLowerCase().localeCompare(bcmd.toLowerCase())
			})
		}
		return rcpCommands
	},

	parseData: (instance, data, params) => {
		let cmds = []
		let line = []
		const lines = data.toString().split('\x0A')

		for (let i = 0; i < lines.length; i++) {
			// I'm not going to even try to explain this next line,
			// but it basically pulls out the space-separated values, except for spaces that are inside quotes!
			line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)

			if (line !== null && ['OK', 'OKM', 'NOTIFY'].indexOf(line[0].toUpperCase()) !== -1) {
				let rcpCommand = {}

				for (var j = 0; j < line.length; j++) {
					// Get rid of any double quotes around the strings and change the colon to underscore
					rcpCommand[params[j]] = line[j].replace(/"/g, '') // .replace(/:/g, '_')
				}

				cmds.push(rcpCommand)

				if (params[0] == 'Ok') {
					// Only do this on initial command list creation
					let rcpName = rcpCommand.Address.slice(rcpCommand.Address.indexOf('/') + 1) // String after "MIXER:Current/"
					if (rcpName.endsWith('Color')) {
						instance.colorCommands.push(rcpName)
					}
				}
			}
		}
		return cmds
	},
}
