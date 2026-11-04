const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const Module = require('node:module')
const path = require('node:path')

// Only replace entrypoint registration and the unavailable Companion IPC host.
// TCPHelper, InstanceBase, variable caches and custom-variable serialization are real SDK code.
test('stable polling, custom-variable writes and TCP actions survive Node migration', async () => {
	const root = process.env.YAMAHA_SOURCE || path.resolve(__dirname, '..')
	const sdk = require(path.join(root, 'node_modules/@companion-module/base'))
	const messages = []
	const oldSend = process.send
	process.send = (message) => {
		const payload = JSON.parse(message.payload)
		messages.push({ name: message.name, payload })
		if (message.callbackId) setImmediate(() => process.emit('message', {
			direction: 'response', callbackId: message.callbackId, success: true,
			payload: JSON.stringify({ text: String(payload.text), variableIds: [] }),
		}))
	}
	let Instance
	const oldLoad = Module._load
	Module._load = function (id, ...args) {
		if (id === '@companion-module/base') return { ...sdk, runEntrypoint: (cls) => { Instance = cls } }
		return oldLoad.call(this, id, ...args)
	}
	try { require(path.join(root, 'index.js')) } finally { Module._load = oldLoad }
	const received = []
	let socket
	const server = net.createServer((client) => {
		socket = client
		client.on('data', (data) => received.push(data.toString()))
	})
	await new Promise((resolve, reject) => { server.once('error', reject); server.listen(49280, '127.0.0.1', resolve) })
	const listeners = new Set(process.listeners('message'))
	const instance = new Instance({ _isInstanceBaseProps: true, id: 'yamaha-test', upgradeScripts: [] })
	let actions, feedbacks
	const setActions = instance.setActionDefinitions.bind(instance)
	instance.setActionDefinitions = (defs) => { actions = defs; setActions(defs) }
	const setFeedbacks = instance.setFeedbackDefinitions.bind(instance)
	instance.setFeedbackDefinitions = (defs) => { feedbacks = defs; setFeedbacks(defs) }
	const waitFor = async (condition) => {
		for (let n = 0; n < 100; n++) {
			if (condition()) return
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
		assert.fail('Timed out waiting for mixer protocol')
	}
	try {
		await instance.init({ model: 'CL/QL', host: '127.0.0.1', metering: false, keepAlive: false })
		await waitFor(() => received.join('').includes('devinfo productname\n'))
		const context = { parseVariablesInString: instance.parseVariablesInString.bind(instance) }
		const id = 'MIXER_Current/InCh/Fader/Level'
		assert.ok(actions[id])
		await actions[id].callback({ actionId: id, options: { X: '1', Y: '1', Val: '-12.5', Relative: false } }, context)
		instance.processCmdQueue()
		await waitFor(() => received.join('').includes('set MIXER:Current/InCh/Fader/Level 0 0 -1250\n'))
		socket.write('OK get MIXER:Current/InCh/Fader/Level 0 0 -650\nOK devinfo productname "CL5"\n')
		await waitFor(() => instance.dataStore['MIXER:Current/InCh/Fader/Level']?.[0]?.[0] == -650)
		assert.equal(instance.getVariableValue('modelName'), 'CL5')
		await feedbacks[id].callback({ feedbackId: id, options: { X: '1', Y: '1', Val: '@(custom:yamaha_level)', createVariable: false } }, context)
		assert.ok(messages.some((m) => m.name === 'setCustomVariable' && m.payload.customVariableId === 'yamaha_level' && m.payload.value === -6.5))
		await feedbacks[id].callback({ feedbackId: id, options: { X: '1', Y: '1', Val: '0', createVariable: true } }, context)
		assert.equal(instance.getVariableValue('V_InCh_Fader_Level_1_1'), -6.5)
		socket.write('OK get MIXER:Current/InCh/Fader/Level 0 0 -32768\n')
		await waitFor(() => instance.dataStore['MIXER:Current/InCh/Fader/Level']?.[0]?.[0] == -32768)
		await feedbacks[id].callback({ feedbackId: id, options: { X: '1', Y: '1', Val: '@(custom:yamaha_level)', createVariable: false } }, context)
		assert.ok(messages.some((m) => m.name === 'setCustomVariable' && m.payload.value === '-Inf'))
	} finally {
		await instance.destroy()
		socket?.destroy()
		await new Promise((resolve) => server.close(resolve))
		for (const listener of process.listeners('message')) if (!listeners.has(listener)) process.removeListener('message', listener)
		process.send = oldSend
	}
})
