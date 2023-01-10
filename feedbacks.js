module.exports = {
	createFeedbackFromAction: (instance, action) => {
		const { combineRgb } = require('@companion-module/base')
		const rcpNames = require('./rcpNames.json')

		let newFeedback = JSON.parse(JSON.stringify(action)) // Clone the Action to a matching feedback

		if (instance.colorCommands.includes(action.name)) {
			newFeedback.type = 'advanced' // New feedback style
			newFeedback.options.pop()
		} else {
			newFeedback.type = 'boolean' // New feedback style

			if (newFeedback.options.length > 0) {
				let lastOptions = newFeedback.options[newFeedback.options.length - 1]
				if (lastOptions.label == 'State') {
					lastOptions.choices.pop() // Get rid of the Toggle setting for Feedbacks
					lastOptions.default = 1 // Don't select Toggle if there's no Toggle!
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

		//console.log("New Feedback: ",newFeedback)

		newFeedback.callback = async (event) => {
			
			console.log('Feedback callback event: ', event)

			let options = event.options
			let rcpCommand = instance.rcpCommands.find((cmd) => cmd.Address == event.feedbackId)
			let retOptions = {}

			if (rcpCommand !== undefined) {
				let optX = await instance.parseVariablesInString(options.X)
				let optY = (options.Y == undefined) ? 1 : options.Y
				if (event.feedbackId.toLowerCase().includes('scene')) {
					optX = 1
					optY = 1
				}

				let optVal = (options.Val == undefined) ? options.X : await instance.parseVariablesInString(options.Val)

				console.log(`\nFeedback Event: '${event.feedbackId}' from controlId '${event.controlId}' is ${rcpCommand.Address}`)
				console.log('options (raw)', options)
				console.log(`X: ${optX}, Y: ${optY}, Val: ${optVal}`)

				if (
					instance.dataStore[event.feedbackId] !== undefined &&
					instance.dataStore[event.feedbackId][optX] !== undefined
				) {
					let data = instance.dataStore[event.feedbackId][optX][optY]
					//                    if (instance.levelCommands.includes(event.feedbackId)) {
					//                        data = (data > -32768) ? (data / 100).toFixed(2) : "-inf"
					//                    }

					console.log('data = ', data, '\toptVal = ', optVal)

					if (data == optVal) {
						console.log('  *** Match ***')
						return true
					} else {
						const reg = /\@\(([^:$)]+):custom_([^)$]+)\)/
						let matches = reg.exec(optVal)
						if (matches) {
							let data = instance.dataStore[event.feedbackId][optX][optY]
							//                            if (instance.levelCommands.includes(event.feedbackId)) {
							//                                data = (data > -32768) ? (data / 100).toFixed(2) : "-inf"
							//                            }
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