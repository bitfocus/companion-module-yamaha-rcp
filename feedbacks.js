module.exports = {
	createFeedbackFromAction: (instance, action) => {
		const { combineRgb } = require('@companion-module/base')
		const paramFuncs = require('./paramFuncs.js')
		const rcpNames = require('./rcpNames.json')

		let newFeedback = JSON.parse(JSON.stringify(action)) // Clone the Action to a matching feedback

		if (instance.colorCommands.includes(action.name)) {
			newFeedback.type = 'advanced' // Old feedback style
			newFeedback.options.pop()
		} else {
			newFeedback.type = 'boolean' // New feedback style

			if (newFeedback.options.length > 0) {
				let stateOption = newFeedback.options.find((option) => option.label == 'State')
				if (stateOption) {
					stateOption.choices.pop() // Get rid of the Toggle setting for Feedbacks
					stateOption.default = 1 // Don't select Toggle if there's no Toggle!
				}
				newFeedback.options = newFeedback.options.filter(
					(option) => option.label != 'Relative' && option.label != 'Fading'
				)
			}
			newFeedback.options.push({
				type: 'checkbox',
				label: 'Auto-Create Variable',
				id: 'createVariable',
				tooltip: 'Creates a Companion variable from this feedback value so it can be shown on buttons or used by other controls.',
				default: false,
			})
		}

		newFeedback.defaultStyle = {
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 0, 0),
		}

		let valOptionIdx = newFeedback.options.findIndex((opt) => opt.id == 'Val')
		if (valOptionIdx > -1) {
			newFeedback.options[valOptionIdx].isVisible = (options) => !options.createVariable
		}

		newFeedback.callback = async (feedback, context) => {
			const varFuncs = require('./variables.js')
			let rcpCmd = paramFuncs.findRcpCmd(feedback.feedbackId)
			if (rcpCmd === undefined) return

			let options = await paramFuncs.parseOptions(context, feedback.options)
			if (options == undefined) return

			let fb = options
			fb.Address = rcpCmd.Address
			fb.Val = await paramFuncs.parseVal(context, fb)

			let data = instance.getFromDataStore(fb)
			if (data == undefined) return

			fb.X = feedback.options.X
			fb.Y = feedback.options.Y
			varFuncs.fbCreatesVar(instance, fb, data) // Are we creating and/or updating a variable?

			//	if (options && data == options.Val) {
			if (fb.Val == data) {
				return true
			}

			let rcpName = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"
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
