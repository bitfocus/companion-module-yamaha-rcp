const assert = require('node:assert/strict')
const { test } = require('node:test')
const net = require('node:net')
const fs = require('node:fs')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const path = require('node:path')

test('real RCP TCP actions, incoming feedback, custom and automatic variable writes', async () => {
	const root = path.resolve(__dirname, '..')
	const requireModule = createRequire(path.join(root, 'index.js'))
	const sdk = requireModule('@companion-module/base')
	let Module
	vm.runInThisContext('(function(require){' + fs.readFileSync(path.join(root, 'index.js'), 'utf8') + '\n})', {
		filename: path.join(root, 'index.js'),
	})((id) =>
		id === '@companion-module/base'
			? {
					...sdk,
					runEntrypoint: (cls) => {
						Module = cls
					},
			  }
			: requireModule(id)
	)
	const sent = []
	const oldSend = process.send
	process.send = (msg) => {
		sent.push({ name: msg.name, payload: JSON.parse(msg.payload) })
	}
	const server = net.createServer()
	await new Promise((resolve) => server.listen(49280, '127.0.0.1', resolve))
	let socket
	const lines = []
	server.on('connection', (s) => {
		socket = s
		s.on('data', (b) => lines.push(...b.toString().trim().split('\n')))
	})
	const instance = new Module({ id: 'test', _isInstanceBaseProps: true, upgradeScripts: [] })
	let actions, feedbacks, active
	instance.setActionDefinitions = (defs) => {
		actions = defs
	}
	instance.setFeedbackDefinitions = (defs) => {
		feedbacks = defs
	}
	const context = {
		parseVariablesInString: async (value) => (typeof value === 'string' ? value.replace('$(custom:channel)', '2') : ''),
	}
	const pending = []
	const failures = []
	instance.checkFeedbacks = () => {
		if (active) pending.push(feedbacks[active.feedbackId].callback(active, context).catch((e) => failures.push(e)))
	}
	instance.subscribeActions = () => {}
	const waitFor = async (condition) => {
		for (let i = 0; i < 200; i++) {
			if (condition()) return
			await new Promise((r) => setTimeout(r, 10))
		}
		assert.fail('Timed out waiting for protocol result: ' + JSON.stringify(lines))
	}
	try {
		await instance.init({ model: 'CL/QL', host: '127.0.0.1', metering: false, keepAlive: false })
		await waitFor(() => lines.includes('devinfo productname'))
		const id = 'MIXER_Current/InCh/Fader/Level'
		assert.ok(actions[id], Object.keys(actions).slice(0, 10).join(','))
		await actions[id].callback(
			{ actionId: id, options: { X: '$(custom:channel)', Y: '1', Val: '-12.5', Rel: false } },
			context
		)
		await waitFor(() => lines.includes('set MIXER:Current/InCh/Fader/Level 1 0 -1250'))
		active = { feedbackId: id, options: { X: '2', Val: '@(custom:fader)', createVariable: false } }
		socket.write('NOTIFY set MIXER:Current/InCh/Fader/Level 1 0 -600\n')
		await waitFor(() => failures.length === 1)
		assert.match(failures[0].message, /setCustomVariableValue is not a function/)
		active.options.createVariable = true
		socket.write('NOTIFY set MIXER:Current/InCh/Fader/Level 1 0 -32768\n')
		await waitFor(() => sent.some((m) => m.name === 'setVariableValues' && JSON.stringify(m.payload).includes('-Inf')))
		await Promise.all(pending)
		assert.equal(instance.getFromDataStore({ Address: 'MIXER:Current/InCh/Fader/Level', X: 1, Y: 0 }), '-32768')
	} finally {
		await instance.destroy()
		socket?.destroy()
		await new Promise((r) => server.close(r))
		process.send = oldSend
	}
})
