/*
// Do the upgrades of actions, release actions and feedback
*/

module.exports = {
	// Upgrade  1.0.x > 1.1.0
	upg111to112: (context, config, actions, feedbacks) => {
		var changed = false
		console.log('Yamaha-SCP: Running 1.1.1 -> 1.1.2 Upgrade.')

		let checkUpgrade = (action, changed) => {
			let newAction = ''

			switch (action.action) {
				case 'InChOn':
					// cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 1';
					newAction = 186
					action.options.X = actions.options.Ch
					action.options.Val = 1
					break
				case 'InChOff':
					// cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 0';
					newAction = 186
					action.options.X = actions.options.Ch
					action.options.Val = 0
					break
				case 'InChLevel':
					// cmd = 'set MIXER:Current/InCh/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					newAction = 184
					action.options.X = action.options.Ch
					action.options.Val = action.options.ChAct
					break
				case ('AuxOn', 'MixOn'):
					// cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 1';
					newAction = 187
					action.options.X = action.options.Ch
					action.options.Val = 1
					break
				case ('AuxOff', 'MixOff'):
					// cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 0';
					newAction = 187
					action.options.X = action.options.Ch
					action.options.Val = 0
					break
				case ('AuxLevel', 'MixLevel'):
					// cmd = 'set MIXER:Current/Mix/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					newAction = 185
					action.options.X = action.options.Ch
					action.options.Val = action.options.ChAct
					break
				case 'MtrxOn':
					// cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 1';
					newAction = 7
					action.options.X = action.options.Ch
					action.options.Val = 1
					break
				case 'MtrxOff':
					// cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 0';
					newAction = 7
					action.options.X = action.options.Ch
					action.options.Val = 0
					break
				case 'MtrxLevel':
					// cmd = 'set MIXER:Current/Mtrx/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					newAction = 2
					action.options.X = action.options.Ch
					action.options.Val = action.options.ChAct
					break
				case 'TFRecall':
					// cmd = 'ssrecall_ex scene_'+ opt.Bank + ' ' + opt.Scene;
					newAction = 1000
					action.options.X = action.options.Scene
					action.options.Y = action.options.Bank
					break
				case 'CLQLRecall':
					// cmd = 'ssrecall_ex MIXER:Lib/Scene ' + opt.Scene;
					newAction = 1000
					action.options.X = action.options.Scene
					break
			}

			if (newAction != '') {
				console.log(`Yamaha-SCP: Action ${action.action} => scp_${newAction}`)
				action.action = 'scp_' + newAction
				action.label = this.id + ':' + action.action
				changed = true
			}

			return changed
		}

		for (let k in actions) {
			changed = checkUpgrade(actions[k], changed)
		}

		return changed
	},

	// Upgrade  1.1.2 > 1.1.3, adds "scp_" in front of action names (for no real reason...)
	upg112to113: (context, config, actions, feedbacks) => {
		console.log('Yamaha-SCP: Running 1.1.2 -> 1.1.3 Upgrade.')
		var changed = false

		let checkUpgrade = (action, changed) => {
			let newAction = ''

			if (action.action != undefined && action.action.slice(0, 4) != 'scp_' && action.action.slice(0, 6) != 'MIXER_') {
				newAction = action.action
			}

			if (newAction != '') {
				console.log(`Yamaha-SCP: Action ${action.action} => scp_${newAction}`)
				action.action = 'scp_' + newAction
				action.label = this.id + ':' + action.action
				changed = true
			}

			return changed
		}

		for (let k in actions) {
			changed = checkUpgrade(actions[k], changed)
		}

		for (let k in feedbacks) {
			changed = checkUpgrade(feedbacks[k], changed)
		}

		return changed
	},

	// Upgrade  1.1.3 > 1.6.0, changes action names to actual RCP names
	upg113to160: (context, config, actions, feedbacks) => {
		var paramFuncs = require('./paramFuncs')

		console.log('Yamaha-RCP: Running 1.1.3 -> 1.6.x+ Upgrade.')
		var changed = false

		if (config != null) {
			console.log("\nYamaha-RCP: Getting Parameters...")
			var rcpCommands = paramFuncs.getParams(this, config)
		}

		let checkUpgrade = (action, isAction, changed) => {
			let newAction = undefined

			let name = isAction ? action.action : action.type

			if (name !== undefined && name.slice(0, 4) == 'scp_') {
				newAction = rcpCommands.find((i) => i.Index == name.slice(4))

				if (newAction !== undefined) {
					newName = newAction.Address
					console.log(`Yamaha-RCP: Action ${name} => ${newName}`)
					isAction ? (action.action = newName) : (action.type = newName)
					action.label = this.id + ':' + newName
					changed = true
				} else {
					console.log(`Yamaha-RCP: Action ${name} not found in list!`)
				}
			}
			return changed
		}

		console.log('\nYamaha-RCP: Checking actions...')
		for (let k in actions) {
			changed = checkUpgrade(actions[k], true, changed)
		}

		console.log('\nYamaha-RCP: Checking feedbacks...')
		for (let k in feedbacks) {
			changed = checkUpgrade(feedbacks[k], false, changed)
		}

		return changed
	},
}
