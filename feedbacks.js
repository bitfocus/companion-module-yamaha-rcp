module.exports = {
	createFeedbackFromAction: (instance, action) => {
		const { combineRgb } = require('@companion-module/base')
		const actionFunctions = require('./actions.js')
		const rcpNames = require('./rcpNames.json')

		let newFeedback = JSON.parse(JSON.stringify(action)) // Clone the Action to a matching feedback

		if (instance.colorCommands.includes(action.name)) {
			newFeedback.type = 'advanced' // Old feedback style
			newFeedback.options.pop()
		} else {
			newFeedback.type = 'boolean' // New feedback style

			if (newFeedback.options.length > 0) {
				let lastOptions = newFeedback.options[newFeedback.options.length - 1]
				if (lastOptions.label == 'State') {
					lastOptions.choices.pop() // Get rid of the Toggle setting for Feedbacks
					lastOptions.default = 1   // Don't select Toggle if there's no Toggle!
				}
				if (lastOptions.label == 'Relative') {
					newFeedback.options.pop() // Get rid of Relative checkbox for feedback
				}
			}

		}

		newFeedback.defaultStyle = {
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 0, 0),
		}

		// Make sure we have the current feedback value stored for variable setting...

		if (newFeedback.name != 'Scene') {
			newFeedback.subscribe = async (feedback) => {

console.log('new Feedback subscription for\n', newFeedback, '\n\n')

				let req = (await actionFunctions.parseCmd(instance, 'get', feedback.feedbackId, feedback.options)).replace(
					'MIXER_',
					'MIXER:'
				)
				instance.sendCmd(req) // Get the current value
			}
		}

		newFeedback.callback = async (event, context) => {

			let options = event.options
			let rcpCommand = instance.rcpCommands.find((cmd) => cmd.Address == event.feedbackId)
			let retOptions = {}

			if (rcpCommand !== undefined) {
console.log(`\nFeedback callback Event: '${event.feedbackId}' from controlId '${event.controlId}' is ${rcpCommand.Address}\n`)
console.log('dataStore: ', instance.dataStore, '\n')
				let optX = await context.parseVariablesInString(options.X)
				let optY = options.Y == undefined ? 1 : options.Y
				if (event.feedbackId.toLowerCase().includes('scene')) {
					optX = 1
					optY = 1
				}

				let optVal = (options.Val == undefined) ? options.X : (await context.parseVariablesInString(options.Val)).trim()

console.log('options (raw)', options)
console.log(`X: ${optX}, Y: ${optY}, Val: ${optVal}`)

				if (
					instance.dataStore[event.feedbackId] !== undefined &&
					instance.dataStore[event.feedbackId][optX] !== undefined
				) {
					let data = instance.dataStore[event.feedbackId][optX][optY]

console.log('Comparing dataStore Value <', data, '>\t to optVal <', optVal, '>\n')

					if (data == optVal) {
						console.log('  *** Match ***')
						return true
					} else {
						const reg = /\@\(([^:$)]+):custom_([^)$]+)\)/
						let matches = reg.exec(optVal)
console.log("\n\n\nSetting Variable ", matches, " to ", data, "\n\n\n")
						if (matches) {
							let data = instance.dataStore[event.feedbackId][optX][optY]
							instance.setCustomVariableValue(matches[2], data)
						}

						if (instance.colorCommands.includes(event.feedbackId)) {
							let c = rcpNames.chColorRGB[instance.dataStore[event.feedbackId][optX][optY]]
							retOptions.color = c.color
							retOptions.bgcolor = c.bgcolor
							//							console.log(`  *** Match *** (Color) ${JSON.stringify(retOptions)}\n`);
							return retOptions
						}
					}
				}

				return false

			}

			return
		}

		return newFeedback
	}
}