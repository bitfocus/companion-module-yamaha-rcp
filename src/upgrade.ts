import { FixupNumericOrVariablesValueToExpressions } from '@companion-module/base'
import paramFuncs from './paramFuncs.js'

/*
// Do the upgrades of actions, release actions and feedback
*/

const UpgradeScripts = [
	() => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	() => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	() => ({
		updatedConfig: null,
		updatedActions: [],
		updatedFeedbacks: [],
	}),

	// Upgrade  2.x > 3.0.x, changes scene action parameter format
	(context, props) => {
		const unwrapOption = (option) => (option && typeof option === 'object' && 'value' in option ? option.value : option)
		const wrapOption = (option) =>
			option && typeof option === 'object' && 'value' in option ? option : { isExpression: false, value: option }
		const isExpression = (option) => Boolean(option && typeof option === 'object' && option.isExpression)

		console.log('\nYamaha-RCP Upgrade: Running 2.x -> 3.x Upgrade.')
		const updates = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		if (context.currentConfig == null) {
			console.log('\nYamaha-RCP Upgrade: NO CONFIG FOUND!\n')
			return updates
		}

		console.log('Yamaha-RCP Upgrade: Config Ok, Getting Parameters...')
		globalThis.rcpCommands = paramFuncs.getParams(context, context.currentConfig)
		console.log('\n')

		const checkUpgrade = (action, isAction) => {
			console.log('Yamaha-RCP Upgrade: Checking action/feedback: ', action)

			let changed = false
			const newAction = JSON.parse(JSON.stringify(action))
			let actionAddress = isAction ? action.actionId : action.feedbackId

			if (actionAddress.startsWith('MIXER_Lib')) {
				actionAddress = 'MIXER_Lib/Scene/Recall'
				newAction.options.Val = wrapOption(newAction.options.X)
				newAction.options.X = wrapOption(0)
				changed = true
			}

			if (actionAddress.startsWith('scene')) {
				actionAddress = 'MIXER_Lib/Bank/Scene/Recall'
				newAction.options.Val = wrapOption(newAction.options.X)
				newAction.options.X = wrapOption(0)
				newAction.options.Y = wrapOption(unwrapOption(action.options.Y) == 'a' ? 1 : 2)
				changed = true
			}

			const rcpCmd = paramFuncs.findRcpCmd(actionAddress)
			if (rcpCmd !== undefined) {
				if ((rcpCmd.Type == 'integer' || rcpCmd.Type == 'binary') && unwrapOption(newAction.options.Val) !== 'Toggle') {
					if (!isExpression(newAction.options.Val)) {
						const value = unwrapOption(newAction.options.Val)
						newAction.options.Val = wrapOption(value == -32768 ? '-Inf' : value / rcpCmd.Scale)
					}
					changed = true
				}

				if (changed) {
					console.log(
						`Yamaha-RCP Upgrade: Updating ${
							isAction
								? "Action '" + newAction.actionId + "' -> '" + actionAddress
								: "Feedback '" + newAction.feedbackId + "' -> '" + actionAddress
						}' ...`,
					)
					console.log(
						`X: ${unwrapOption(action.options.X)} -> ${unwrapOption(newAction.options.X)}, Y: ${unwrapOption(action.options.Y)} -> ${unwrapOption(newAction.options.Y)}, Val: ${unwrapOption(action.options.Val)} -> ${unwrapOption(newAction.options.Val)}\n`,
					)

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

		for (const k in props.actions) {
			checkUpgrade(props.actions[k], true)
		}

		for (const k in props.feedbacks) {
			checkUpgrade(props.feedbacks[k], false)
		}

		return updates
	},

	(context, props) => {
		console.log('\nYamaha-RCP Upgrade: Running 3.x -> 3.4 Upgrade.')
		const updates = {
			updatedConfig: props.config || {},
			updatedActions: [],
			updatedFeedbacks: [],
		}

		if (context.currentConfig == null) {
			console.log('\nYamaha-RCP Upgrade: NO CONFIG FOUND!\n')
			return updates
		}

		// Set defaults for existing configurations.
		if (updates.updatedConfig.meterSpeed == undefined) updates.updatedConfig.meterSpeed = 100
		if (updates.updatedConfig.kaIntervalL == undefined) updates.updatedConfig.kaIntervalL = 10
		if (updates.updatedConfig.kaIntervalH == undefined) updates.updatedConfig.kaIntervalH = 10

		const checkUpgrade = (action, isAction) => {
			console.log('Yamaha-RCP Upgrade: Checking action/feedback: ', action)

			let changed = false
			const newAction = JSON.parse(JSON.stringify(action))
			let actionAddress = isAction ? action.actionId : action.feedbackId

			if (actionAddress == 'Bar') {
				actionAddress = 'Meter'
				changed = true
			}

			if (changed) {
				console.log(
					`Yamaha-RCP Upgrade: Updating ${
						isAction
							? "Action '" + action.actionId + "' -> '" + actionAddress
							: "Feedback '" + action.feedbackId + "' -> '" + actionAddress
					}' ...`,
				)
				console.log(
					`X: ${action.options.X} -> ${newAction.options.X}, Y: ${action.options.Y} -> ${newAction.options.Y}, Val: ${action.options.Val} -> ${newAction.options.Val}\n`,
				)

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

		for (const k in props.actions) {
			checkUpgrade(props.actions[k], true)
		}

		for (const k in props.feedbacks) {
			checkUpgrade(props.feedbacks[k], false)
		}

		return updates
	},

	// Upgrade 3.4 -> 4.0 options to Companion's automatically parsed expression values.
	(context, props) => {
		console.log('\nYamaha-RCP Upgrade: Running 3.4 -> 4.0 expression upgrade.')
		const updates = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		if (context.currentConfig == null) {
			console.log('\nYamaha-RCP Upgrade: NO CONFIG FOUND!\n')
			return updates
		}

		console.log('Yamaha-RCP Upgrade: Config Ok, Getting Parameters...')
		globalThis.rcpCommands = paramFuncs.getParams(context, context.currentConfig)

		const fixOptions = (item, isAction) => {
			const itemId = isAction ? item.actionId : item.feedbackId
			console.log('Yamaha-RCP Upgrade: Checking action/feedback: ', item)
			const commandId = itemId?.endsWith('_Value') ? itemId.slice(0, -'_Value'.length) : itemId
			const command = paramFuncs.findRcpCmd(commandId)
			const options = JSON.parse(JSON.stringify(item.options || {}))
			let changed = false

			const fixOption = (key) => {
				const option = options[key]
				if (option === undefined || option === null) return

				const wrappedOption =
					typeof option === 'object' && 'value' in option ? option : { isExpression: false, value: option }
				const fixedOption = FixupNumericOrVariablesValueToExpressions(wrappedOption)
				if (JSON.stringify(fixedOption) !== JSON.stringify(option)) {
					options[key] = fixedOption
					changed = true
				}
			}

			fixOption('X')
			fixOption('Y')
			if (command && ['integer', 'freq', 'mtr'].includes(command.Type)) fixOption('Val')

			if (changed) {
				console.log(`Yamaha-RCP Upgrade: Updating ${isAction ? 'Action' : 'Feedback'} '${itemId}' ...`)
				console.log(
					`X: ${JSON.stringify(item.options?.X)} -> ${JSON.stringify(options.X)}, Y: ${JSON.stringify(item.options?.Y)} -> ${JSON.stringify(options.Y)}, Val: ${JSON.stringify(item.options?.Val)} -> ${JSON.stringify(options.Val)}\n`,
				)
				const updatedItem = { ...item, options }
				if (isAction) updates.updatedActions.push(updatedItem)
				else updates.updatedFeedbacks.push(updatedItem)
			}
		}

		for (const action of props.actions || []) fixOptions(action, true)
		for (const feedback of props.feedbacks || []) fixOptions(feedback, false)

		return updates
	},
]

export default UpgradeScripts
