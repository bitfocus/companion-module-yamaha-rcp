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

	// Upgrade  2.x > 3.0.x, changes scene action parameter format
	upg2xxto30x = (context, props) => {
		var paramFuncs = require('./paramFuncs')

		console.log('\nYamaha-RCP Upgrade: Running 2.x -> 3.0.x Upgrade.')
		var updates = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: []
		}
		
		if (context.currentConfig == null) {
			console.log('\nYamaha-RCP Upgrade: NO CONFIG FOUND!\n')
			return updates
		}

		console.log('Yamaha-RCP Upgrade: Config Ok, Getting Parameters...')
		var rcpCommands = paramFuncs.getParams({config: context.currentConfig})
		console.log('\n')

		let checkUpgrade = (action, isAction) => {
		console.log('Yamaha-RCP Upgrade: Checking action/feedback: ', action)

			let changed = false
			let rcpCmd = undefined
			let newAction = JSON.parse(JSON.stringify(action))
			let actionAddress = isAction ? action.actionId : action.feedbackId

			if (actionAddress.startsWith('MIXER_Lib')) {
				actionAddress = 'MIXER_Lib/Scene/Recall'
				newAction.options.Val = action.options.X
				newAction.options.X = 0
				changed = true
			}

			if (actionAddress.startsWith('scene')) {
				actionAddress = 'MIXER_Lib/Bank/Scene/Recall'
				newAction.options.Val = action.options.X
				newAction.options.X = 0
				newAction.options.Y = action.options.Y == 'a' ? 1 : 2
			}

			rcpCmd = rcpCommands.find((i) => i.Address.replace(/:/g, '_') == actionAddress)
//console.log('Yamaha-RCP Upgrade: rcpCmd:', rcpCmd)

			if (rcpCmd !== undefined) {

				if (rcpCmd.Type == 'integer' || rcpCmd.Type == 'binary') {
					newAction.options.Val = newAction.options.Val == rcpCmd.Min ? '-Inf' : newAction.options.Val / rcpCmd.Scale
					changed = true
				}

				if (changed) {
					console.log(`Yamaha-RCP Upgrade: Updating ${isAction ? "Action '" + newAction.actionId + "' -> '" + actionAddress : "Feedback '" + newAction.feedbackId + "' -> '" + actionAddress}' ...`)
					console.log(`X: ${action.options.X} -> ${newAction.options.X}, Y: ${action.options.Y} -> ${newAction.options.Y}, Val: ${action.options.Val} -> ${newAction.options.Val}\n`)

					if (isAction) {
						newAction.actionId = actionAddress
						updates.updatedActions.push(newAction) 
					} else {
						newAction.feedbackId = actionAddress
						updates.updatedFeedbacks.push(newAction)
					}
 				}

				return
			}
			
			console.log(`Yamaha-RCP Upgrade: Action ${actionAddress} not found in list!`)

		}

		for (let k in props.actions) {
			checkUpgrade(props.actions[k], true)
		}

		for (let k in props.feedbacks) {
			checkUpgrade(props.feedbacks[k], false)
		}

		return updates
	},
]
