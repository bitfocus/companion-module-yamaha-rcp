module.exports = {
	createFeedbackFromAction: (instance, action) => {
		const { combineRgb } = require('@companion-module/base')
		const actionFuncs = require('./actions.js')
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
					lastOptions.default = 1 // Don't select Toggle if there's no Toggle!
				}
				if (lastOptions.label == 'Relative') {
					newFeedback.options.pop() // Get rid of Relative checkbox for feedback
				}
			}
			newFeedback.options.push({
				type: 'checkbox',
				label: 'Auto-Create Variable?',
				id: 'createVariable',
				default: false,
			})
/*
			newFeedback.options.push({
				type: 'custom-variable',
				label: 'Set Value to Variable',
				id: 'varToSet'
			})
*/
		}

		newFeedback.defaultStyle = {
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 0, 0),
		}

		let valOptionIdx = newFeedback.options.findIndex((opt) => opt.id == 'Val')
		if (valOptionIdx > -1) {
			newFeedback.options[valOptionIdx].isVisible = (options) => !options.createVariable
		}

		newFeedback.callback = async (event, context) => {
			let rcpCommand = instance.findRcpCmd(event.feedbackId)
			let options = await instance.parseOptions(instance, context, { rcpCmd: rcpCommand, options: event.options })
			let data = await instance.getFromDataStore({ Address: rcpCommand.Address, options: options })
			if (options && data == options.Val) {
				return true
			}

			let rcpName = rcpCommand.Address.slice(rcpCommand.Address.indexOf('/') + 1) // String after "MIXER:Current/"
			if (instance.colorCommands.includes(rcpName)) {
				let retOptions = {}
				let c = rcpNames.chColorRGB[data]
				if (c != undefined) {
					retOptions.color = c.color
					retOptions.bgcolor = c.bgcolor
				}
				return retOptions
			}
			return false
		}

		return newFeedback
	},
}
