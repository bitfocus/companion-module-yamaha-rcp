module.exports = {
	getParams: (instance, config) => {
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

		let fname = ''
		let rcpCommands
		const FS = require('fs')

		switch (config.model) {
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
		if (fname !== '') {
			let data = FS.readFileSync(`${__dirname}/${fname}`)
			rcpCommands = module.exports.parseData(instance, data, RCP_PARAMS)

			rcpCommands.sort((a, b) => {
				// Sort the commands
				let acmd = a.Address.slice(a.Address.indexOf('/') + 1)
				let bcmd = b.Address.slice(b.Address.indexOf('/') + 1)
				return acmd.toLowerCase().localeCompare(bcmd.toLowerCase())
			})

			for (let i = 0; i < 4; i++) {
				rcpNames.chNames[i] = { id: `-${i + 1}`, label: config[`myChName${i + 1}`] }
			}
		}

		//console.log('rcpCommands: ', rcpCommands)
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

			if (line !== null && ['OK', 'NOTIFY'].indexOf(line[0].toUpperCase()) !== -1) {
				let rcpCommand = {}

				for (var j = 0; j < line.length; j++) {
					rcpCommand[params[j]] = line[j].replace(/"/g, '') // Get rid of any double quotes around the strings
				}

				cmds.push(rcpCommand)

				if (params[0] == 'Ok') {
                   switch (rcpCommand.Address.slice(-4)) {
						case 'Name':
							instance.nameCommands.push(rcpCommand.Address.replace(/:/g, '_'))
							break
						case 'olor':
							instance.colorCommands.push(rcpCommand.Address.replace(/:/g, '_'))
					}
				}
			}
		}
		return cmds
	},
}
