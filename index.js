// Control module for Yamaha Pro Audio digital mixers
// Andrew Broughton <andy@checkcheckonetwo.com>
// Apr 2025 Version 3.5.7 (for Companion v3/v4)

const { InstanceBase, Regex, runEntrypoint, combineRgb, TCPHelper } = require('@companion-module/base')

const paramFuncs = require('./paramFuncs')
const actionFuncs = require('./actions.js')
const varFuncs = require('./variables.js')
const upgrade = require('./upgrade')

const RCP_PORT = 49280
const MSG_DELAY = 5
const METER_REFRESH = 10000 // 10 seconds
const KA_INTERVAL = 10000 // 10 seconds

// Instance Setup
class instance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	// Startup
	async init(cfg) {
		this.updateStatus('Starting')
		global.config = cfg
		global.rcpCommands = []
		this.colorCommands = [] // Commands which have a color field
		this.rcpPresets = []
		this.dataStore = {} // status, Address (using ":"), X, Y, Val
		this.cmdQueue = [] // prefix, Address (using ":"), X, Y, Val
		this.queueTimer
		this.meterTimer = {}
		this.kaTimer = {}
		this.variables = []
		this.newConsole()
	}

	// Change in Configuration
	async configUpdated(cfg) {
		config = cfg
		if (config.model) {
			this.newConsole()
		}
	}

	// Module deletion
	async destroy() {
		clearTimeout(this.queueTimer)
		clearInterval(this.meterTimer)
		this.socket?.destroy()
		this.log('debug', `[${new Date().toJSON()}] destroyed ${this.id}`)
	}

	// Web UI config fields
	getConfigFields() {
		let config = [
			{
				type: 'dropdown',
				id: 'model',
				label: 'Console/PreAmp Type',
				width: 12,
				default: 'CL/QL',
				choices: [
					{ id: 'CL/QL', label: 'CL/QL Console' },
					{ id: 'PM', label: 'Rivage PM Console' },
					{ id: 'TF', label: 'TF Console' },
					{ id: 'DM3', label: 'DM3 Console' },
					{ id: 'DM7', label: 'DM7 Console' },
					{ id: 'RIO', label: 'RIO Preamp' },
					{ id: 'TIO', label: 'TIO Preamp' },
					{ id: 'RSIO', label: 'RSio IO Device' },
				],
			},
			{
				type: 'bonjour-device',
				id: 'bonjour_host',
				label: 'Bonjour Address of Device',
				width: 6,
				default: '',
				regex: Regex.IP,
				isVisible: (options) => {
					let vis = ['RIO', 'TIO', 'RSIO'].includes(options.model)
					if (!vis) options.bonjour_host = undefined
					return vis
				},
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address of Device',
				width: 6,
				default: '192.168.0.128',
				regex: Regex.IP,
				isVisible: (options) => !options.bonjour_host || !['RIO', 'TIO', 'RSIO'].includes(options.model),
			},
			{
				type: 'static-text',
				label: '',
				width: 6,
				isVisible: (options) => !!options.bonjour_host || !['RIO', 'TIO', 'RSIO'].includes(options.model),
			},
			{
				type: 'checkbox',
				id: 'metering',
				label: 'Enable Metering?',
				width: 3,
				default: false,
			},
			{
				type: 'number',
				id: 'meterSpeed',
				label: 'Metering interval (40 - 1000 ms)',
				width: 8,
				default: 100,
				min: 40,
				max: 1000,
			},
			{
				type: 'checkbox',
				id: 'keepAlive',
				label: 'Enable KeepAlive?',
				width: 3,
				default: false,
			},
			{
				type: 'static-text',
				label: '**NOTE** KeepAlive will attempt to keep the connection alive by regularly sending an innocuous message to the device.',
				width: 12,
			},
		]
		//config.kaInterval = (['TF', 'DM3', 'DM7'].includes(options.model)) ? config.kaInterval
		return config
	}

	// Whenever the console type changes, update the info
	newConsole() {
		this.log('info', `Device selected: ${config.model}`)
		rcpCommands = paramFuncs.getParams(this, config)

		actionFuncs.updateActions(this) // Re-do the actions once the console is chosen
		varFuncs.initVars(this)
		this.createPresets()
		config.host = config.bonjour_host?.split(':')[0] || config.host
		this.initTCP()
	}

	// Initialize TCP
	initTCP() {
		let receiveBuffer = ''
		let receivedLines = []
		let receivedCmds = []
		let foundCmd = {}

		this.socket?.destroy()
		delete this.socket

		if (config.host) {
			this.socket = new TCPHelper(config.host, RCP_PORT)

			this.socket.on('status_change', (status, message) => {
				this.updateStatus(status, message)
			})

			this.socket.on('error', (err) => {
				this.log('error', `Network error: ${err.message}`)
			})

			this.socket.on('connect', () => {
				this.log('info', `Connected!`)
				clearInterval(this.meterTimer)
				clearInterval(this.kaTimer)
				varFuncs.getVars(this)
				this.queueTimer = {}
				this.processCmdQueue()
				if (config.metering) {
					this.startMeters()
					this.meterTimer = setInterval(() => this.startMeters(), METER_REFRESH)
				}
				if (config.keepAlive) {
					this.sendCmd(`scpmode keepalive ${KA_INTERVAL}`) // To possibly keep the device from closing the connection
					this.kaTimer = setInterval(() => this.sendCmd('devstatus runmode'), config.kaInterval * 1000)
				}
			})

			this.socket.on('data', (chunk) => {
				receiveBuffer += chunk
				receivedLines = receiveBuffer.split('\x0A') // Split by line break
				if (receivedLines.length == 0) {
					return // No messages
				}

				if (receiveBuffer.endsWith('\x0A')) {
					receiveBuffer = receivedLines[receivedLines.length - 1] // Broken line, leave it for next time...
					receivedLines.splice(receivedLines.length - 1) // Remove it.
				} else {
					receiveBuffer = ''
				}

				for (let line of receivedLines) {
					if (line.length == 0) {
						continue
					}
					this.log('debug', `[${new Date().toJSON()}] Received: '${line}'`)
					receivedCmds = paramFuncs.parseData(line) // Break out the parameters

					for (let i = 0; i < receivedCmds.length; i++) {
						let curCmd = JSON.parse(JSON.stringify(receivedCmds[i])) // deep clone
						foundCmd = paramFuncs.findRcpCmd(curCmd.Address, curCmd.Action) // Find which command

						switch (curCmd.Action) {
							case 'set':
							case 'get':
								if (foundCmd != undefined) {
									if (!(curCmd.Status == 'OK' && curCmd.Action == 'set')) {
										this.addToDataStore(curCmd)
									}

									if (this.isRecordingActions) {
										this.addToActionRecording({ rcpCmd: foundCmd, options: curCmd })
									}
								}
								break

							case 'sscurrent_ex':
							case 'sscurrentt_ex':
								if (curCmd.Status == 'NOTIFY') {
									this.pollConsole()
								}
								break

							case 'mtr':
								if (foundCmd === undefined) break
								if (foundCmd.Pickoff) {
									let lastSlash = curCmd.Address.lastIndexOf('/')
									let pickoff = curCmd.Address.slice(lastSlash + 1)
									curCmd.Y = foundCmd.Pickoff.split('|').indexOf(pickoff)
								}
								curCmd.Address = foundCmd.Address
								let i = 0
								while (curCmd[i]) {
									curCmd.X = i
									curCmd.Val = parseInt(curCmd[i], 16)
									this.addToDataStore(curCmd)
									i++
								}
						}

						varFuncs.setVar(this, curCmd)
						this.processCmdQueue(curCmd)
					}
				}
			})
		}
	}

	// New Command (Action or Feedback) to Add
	addToCmdQueue(cmd) {
		clearTimeout(this.queueTimer)
		let cmdToAdd = JSON.parse(JSON.stringify(cmd)) // Deep Clone
		let rcpCmd = paramFuncs.findRcpCmd(cmdToAdd.Address)
		let i = this.cmdQueue.findIndex(
			(c) =>
				c.prefix == cmdToAdd.prefix &&
				c.Address == cmdToAdd.Address &&
				((c.X == cmdToAdd.X && c.Y == cmdToAdd.Y) || (rcpCmd.Action == 'mtrinfo' && c.Y == cmdToAdd.Y))
		)
		if (i > -1) {
			this.cmdQueue[i] = cmdToAdd // Replace queued message with new one
		} else {
			this.cmdQueue.push(cmdToAdd)
		}

		if (this.queueTimer) {
			this.queueTimer = setTimeout(() => {
				this.processCmdQueue()
			}, MSG_DELAY)
		}
	}

	// When a message comes in from the console, match it up and delete it, and send the next message
	processCmdQueue(cmd) {
		clearTimeout(this.queueTimer)
		if (this.cmdQueue == undefined || this.cmdQueue.length == 0) return
		if (cmd != undefined) {
			let i = this.cmdQueue.findIndex(
				(c) => c.prefix == 'get' && c.Address == cmd.Address && c.X == cmd.X && c.Y == cmd.Y
			)
			if (i > -1) {
				this.cmdQueue.splice(i, 1) // Got value from matching request so remove it!
			}
		}

		if (this.cmdQueue.length > 0) {
			// Messages still to send?
			let nextCmd = this.cmdQueue[0] // Oldest

			if (nextCmd.prefix == 'set') {
				let nextCmdVal = paramFuncs.parseVal(this, nextCmd)
				if (nextCmdVal == undefined) {
					this.cmdQueue.shift()
					this.cmdQueue.push(nextCmd)

					this.queueTimer = setTimeout(() => {
						this.processCmdQueue()
					}, MSG_DELAY)

					return
				}
				nextCmd.Val = nextCmdVal
			}

			let msg = paramFuncs.fmtCmd(nextCmd)
			if (this.sendCmd(msg)) {
				if (nextCmd.prefix == 'set') {
					this.addToDataStore(nextCmd) // Update to latest value
				}
			}

			this.cmdQueue.shift() // Get rid of message, whether sent or not
			this.queueTimer = setTimeout(() => {
				this.processCmdQueue()
			}, MSG_DELAY)
		}
	}

	// Create the preset definitions
	createPresets() {
		var meterCmds = global.rcpCommands.filter((c) => c.Action == 'mtrinfo').sort((a, b) => (a.Index == b.Index) ? 0 : (a.Index > b.Index) ? 1 : -1)
		this.rcpPresets = []
		var meterPreset = {
				type: 'button',
				category: 'Level Meters',
				name: '',
				style: {
					text: '',
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
				},
				steps: [],
				feedbacks: [
					{
						feedbackId: 'Meter',
						options: {
							position: 'right',
							padding: 1,
							meterVal1: '',
							meterVal2: '',
						},
					},
					{
						feedbackId: '',
						options: {
							X: 1,
							Y: 1,
							createVariable: true,
						},
						style: {
						}
					},
				],
			}
			
			for (const c of meterCmds) {
				var curPreset = JSON.parse(JSON.stringify(meterPreset))
				// console.log(c)
				var addrParts = c.Address.split('/')
				var cmdName = (addrParts.length > 1) ? addrParts[2] : ''
				var pickoffIndex = (c.Index < 2100) ? 1 : c.Y
				var pickoffName = ''
				if (c.Pickoff) {
					cmdName = (addrParts.length > 0) ? addrParts[addrParts.length - 1] : ''
					var pickoffParts = c.Pickoff.split('|')
					pickoffName = `_${pickoffParts[pickoffIndex - 1]}` 
				}
				if (cmdName) {
					curPreset.name = `Meter Level Indicator - ${cmdName}`
					curPreset.style.text = `${cmdName}\\nMeter`
					curPreset.feedbacks[0].options.meterVal1 = `$(${this.label}:V_Meter_${cmdName}_1${pickoffName})`
					curPreset.feedbacks[1].feedbackId = c.Address.replace(/:/g, '_')
					curPreset.feedbacks[1].options.Y = pickoffIndex
					if (cmdName == 'St') { // Make a Stereo Meter for L/R
						curPreset.feedbacks[0].options.meterVal2 = `$(${this.label}:V_Meter_${cmdName}_2${pickoffName})`
						curPreset.feedbacks.push(JSON.parse(JSON.stringify(curPreset.feedbacks[1])))
						curPreset.feedbacks[2].options.X = 2 // Right channel
					}
					this.rcpPresets.push(curPreset)
				}
			}

/*
			{
				type: 'button',
				category: 'Macros',
				name: 'Create RCP Macro',
				style: {
					text: 'Record RCP Macro',
					png64: this.ICON_REC_INACTIVE,
					pngalignment: 'center:center',
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0),
				},
				steps: [
					{
						down: [{ actionId: 'internal:Action Recorder: Set connections' }],
					},
				],
				feedbacks: [
					{
						feedbackId: 'macro',
						options: {
							mode: 'r',
							fg: combineRgb(0, 0, 0),
							bg: combineRgb(255, 0, 0),
						},
					},
				],
			},

*/

		this.setPresetDefinitions(this.rcpPresets)
	}

	// Track whether actions are being recorded
	handleStartStopRecordActions(isRecording) {
		this.isRecordingActions = isRecording
	}

	// Add a command to the Action Recorder
	async addToActionRecording(c) {
		let aId = c.rcpCmd.Address.replace(/:/g, '_')
		let cX = parseInt(c.options.X) + 1
		let cY = parseInt(c.options.Y) + 1
		let cV

		switch (c.rcpCmd.Type) {
			case 'integer':
			case 'binary':
				cV = c.options.Val == -32768 ? '-Inf' : c.options.Val / c.rcpCmd.Scale
				break
			case 'freq':
				cV = c.options.Val / c.rcpCmd.Scale
				break
			case 'bool':
				cV = 'Toggle'
				break
			case 'string':
				cV = c.options.Val
				break
		}

		this.recordAction(
			{
				actionId: aId,
				options: { X: cX, Y: cY, Val: cV },
			},
			`${aId} ${cX} ${cY}` // uniqueId to stop duplicates
		)
	}

	sendCmd(c) {
		if (c !== undefined) {
			c = c.trim()
			this.log(
				'debug',
				`[${new Date().toJSON()}] Sending :    '${c}' to ${this.getVariableValue('modelName')} @ ${config.host}`
			)

			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(`${c}\n`) // send the message to the device
				return true
			}
			this.log('info', 'Socket not connected :(')
		}
		return false
	}

	// Poll the console for it's status to update buttons via feedback
	pollConsole() {
		//varFuncs.getVars(this)
		this.dataStore = {}
		this.subscribeActions()
		this.checkFeedbacks()
	}

	// Add a value to the dataStore
	addToDataStore(cmd) {
		let dsAddr = cmd.Address
		let dsX = cmd.X == undefined ? 0 : parseInt(cmd.X)
		let dsY = cmd.Y == undefined ? 0 : parseInt(cmd.Y)

		if (this.dataStore[dsAddr] == undefined) {
			this.dataStore[dsAddr] = {}
		}
		if (this.dataStore[dsAddr][dsX] == undefined) {
			this.dataStore[dsAddr][dsX] = {}
		}
		if (this.dataStore[dsAddr][dsX][dsY] != cmd.Val) {
			this.dataStore[dsAddr][dsX][dsY] = cmd.Val
			this.checkFeedbacks(dsAddr.replace(/:/g, '_')) // Make sure variables are updated
		}
	}

	// Get a value from the dataStore. If the value doesn't exist, send a request to get it.
	getFromDataStore(cmd) {
		let data = undefined
		if (cmd == undefined) return data

		if (cmd.Address !== undefined) {
			if (
				this.dataStore[cmd.Address] !== undefined &&
				this.dataStore[cmd.Address][cmd.X] !== undefined &&
				this.dataStore[cmd.Address][cmd.X][cmd.Y] !== undefined
			) {
				data = this.dataStore[cmd.Address][cmd.X][cmd.Y]
				return data
			}
			let rcpCmd = paramFuncs.findRcpCmd(cmd.Address)
			if (rcpCmd !== undefined && rcpCmd.RW.includes('r')) {
				cmd.prefix = 'get'
				this.addToCmdQueue(cmd)
			}
		}

		return data
	}

	// Start requesting meter data
	startMeters() {
		let mtrFeedbacks = rcpCommands.filter((f) => f.Type == 'mtr')
		let fbNames = Array.from(mtrFeedbacks, (f) => f.Address)
		fbNames.forEach((fb) => {
			let cmd = this.dataStore[fb]
			if (cmd) {
				for (let key in cmd[0]) {
					let cmdToSend = { Address: fb, X: 0, Y: key }
					cmdToSend.prefix = 'get'
					this.addToCmdQueue(cmdToSend)
				}
			}
		})
	}
}

runEntrypoint(instance, upgrade)
