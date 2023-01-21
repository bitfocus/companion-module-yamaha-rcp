/*
// Do the upgrades of actions, release actions and feedback
*/

module.exports = {

	// Upgrade  1.x > 3.0.0, changes scene action parameter format
	upg1xxto300: (context, config, actions, feedbacks) => {
		var paramFuncs = require('./paramFuncs')

		console.log('Yamaha-RCP: Running 1.x-> 3.0.0 Upgrade.')
		var changed = false

		if (config != null) {
			console.log('\nYamaha-RCP: Getting Parameters...')
			var rcpCommands = paramFuncs.getParams(this, config)
		}

		let checkUpgrade = (action, isAction, changed) => {
			let newAction = undefined

			let id = isAction ? action.action : action.type

			if (id == 1000) {
				newAction = rcpCommands.find((i) => i.Index == id)

				if (newAction !== undefined) {
					newName = newAction.Address
					console.log(`Yamaha-RCP: Updating ${(isAction) ? 'Action' : 'Feedback'} #${id} (${newName}...)`)
					action.Val = action.X
					action.X = 0
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
