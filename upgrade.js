/*
// Do the upgrades of actions, release actions and feedback
*/

module.exports = [
	upg111to112 = () => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	upg112to113 = () => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	upg113to160 = () => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	// Upgrade  2.x > 3.0.0, changes scene action parameter format
	upg2xxto30x = (context, props) => {
		var paramFuncs = require('./paramFuncs')

		console.log('Yamaha-RCP Upgrade: Running 2.x -> 3.0.x Upgrade.')
		var updates = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: []
		}

		console.log('context = ', context, '\n\n')
		console.log('props = ', props, '\n\n')
		
		var configToUse = (context != null) ? context : props
		if (configToUse.config == null) {
			console.log('Yamaha-RCP Upgrade: NO CONFIG FOUND!\n\n')
			return updates
		}

		console.log('\nYamaha-RCP Upgrade: Config Ok, Getting Parameters...')

		if (props.config != null) { // full import
			var rcpCommands = paramFuncs.getParams(props)
		} else if (context.config != null) { // partial import
			var rcpCommands = paramFuncs.getParams(context)
		}

		let checkUpgrade = (action, isAction) => {
console.log('Yamaha-RCP Upgrade: Checking: ', action)

			let newAction = undefined
			let actionAddress = isAction ? action.action : action.type
			if (actionAddress == 'MIXER_Lib/Scene') {
				actionAddress = 'MIXER:Lib/Scene/Recall'
			}

			newAction = rcpCommands.find((i) => i.Address == actionAddress)

			if (newAction !== undefined) {
				console.log(`Yamaha-RCP Upgrade: Updating ${isAction ? 'Action' : 'Feedback'} ${newAction.Address}...)`)

				switch (newAction.Address) {
					case 'MIXER:Lib/Scene': {
						newAction.Val = action.X
						newAction.X = 0
					}
				}
				(isAction) ? updates.updatedActions.push(newAction) : updates.updatedFeedbacks.push(newAction)
			} else {
				console.log(`Yamaha-RCP Upgrade: Action ${newName} not found in list!`)
			}
		}

		console.log('\nYamaha-RCP Upgrade: Checking actions...')
		for (let k in props.actions) {
			checkUpgrade(props.actions[k], true)
		}
		console.log('\n')

		console.log('Yamaha-RCP Upgrade: Checking feedbacks...')
		for (let k in props.feedbacks) {
			checkUpgrade(props.feedbacks[k], false)
		}
		console.log('\n')

		return updates
	},
]
