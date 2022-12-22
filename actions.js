module.exports = {

    // Create single Action/Feedback
    createAction : (instance, rcpCmd) => {
        
        const rcpNames = require('./rcpNames.json')

        let newAction = {}
        let valParams = {}
        let rcpLabel = ''

        if (instance.config.model == 'TF' && rcpCmd.Type == 'scene') {
            rcpLabel = 'Scene/Bank'
        } else {
            rcpLabel = rcpCmd.Address.slice(rcpCmd.Address.indexOf('/') + 1) // String after "MIXER:Current/"
        }

        // Add the commands from the data file. Action id's (action.action) are the rcp command text (Address)
        let rcpLabels = rcpLabel.split('/')
        let rcpLabelIdx = rcpLabel.startsWith('Cue') ? 1 : 0

        newAction = { name: rcpLabel, options: [] }
        if (rcpCmd.X > 1) {
            if (rcpLabel.startsWith('InCh') || rcpLabel.startsWith('Cue/InCh')) {
                newAction.options = [
                    {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'X',
                        default: 1,
                        minChoicesForSearch: 0,
                        choices: rcpNames.chNames.slice(0, parseInt(rcpCmd.X)),
                        allowCustom: true
                    },
                ]
            } else if (instance.config.model == 'PM' && rcpCmd.Type == 'scene') {
                newAction.options = [
                    {
                        type: 'textinput',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'X',
                        default: rcpCmd.Default,
                        regex: '/^([1-9][0-9]{0,2})\\.[0-9][0-9]$/'
                    }
                ]
            } else {
                newAction.options = [
                    {
                        type: 'number',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'X',
                        min: 1,
                        max: rcpCmd.X,
                        default: 1,
                        required: true,
                        range: false,
                    },
                ]
            }
            rcpLabelIdx++
        }

        if (rcpCmd.Y > 1) {
            if (instance.config.model == 'TF' && rcpCmd.Type == 'scene') {
                valParams = {
                    type: 'dropdown',
                    label: rcpLabels[rcpLabelIdx],
                    id: 'Y',
                    default: 'a',
                    choices: [
                        { id: 'a', label: 'A' },
                        { id: 'b', label: 'B' },
                    ],
                }
            } else {
                valParams = {
                    type: 'number',
                    label: rcpLabels[rcpLabelIdx],
                    id: 'Y',
                    min: 1,
                    max: rcpCmd.Y,
                    default: 1,
                    required: true,
                    range: false,
                }
            }

            newAction.options.push(valParams)
        }

        if (rcpLabelIdx < rcpLabels.length - 1) {
            rcpLabelIdx++
        }

        switch (rcpCmd.Type) {
            case 'integer':
                newAction.subscribe = async (action) => {
                    let req = (await module.exports.parseCmd(instance, 'get', action.actionId, action.options)).replace("MIXER_", "MIXER:")
                    
                    if (req !== undefined) {
                        instance.log('debug', `Sending : '${req}' to ${instance.config.host}`)
        
                        if (instance.socket !== undefined && instance.socket.isConnected) {
                            instance.socket.send(`${req}\n`) // get current param
                        } else {
                            instance.log('info', 'Socket not connected :(')
                        }
                    }
                }

                if (rcpCmd.Max == 1) {
                    // Boolean?
                    valParams = {
                        type: 'dropdown',
                        label: 'State',
                        id: 'Val',
                        default: 'Toggle',
                        minChoicesForSearch: 0,
                        choices: [
                            { label: 'On', id: 1 },
                            { label: 'Off', id: 0 },
                            { label: 'Toggle', id: 'Toggle' },
                        ],
                    }
                } else {
                    newAction.options.push({
                        type: 'number',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        min: rcpCmd.Min,
                        max: rcpCmd.Max,
                        default: parseInt(rcpCmd.Default),
                        required: true,
                        range: false,
                        allowExpression: true
                    })
                    valParams = {
                        type: 'checkbox',
                        label: 'Relative',
                        id: 'Rel',
                        default: false
                    }	
                }
                break
            case 'string':
            case 'binary':
                if (rcpLabel.startsWith('CustomFaderBank')) {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: rcpNames.customChNames,
                    }
                } else if (rcpLabel.endsWith('Color')) {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: instance.config.model == 'TF' ? rcpNames.chColorsTF : rcpNames.chColors,
                    }
                } else if (rcpLabel.endsWith('Icon')) {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: rcpNames.chIcons,
                    }
                } else if (rcpLabel == 'InCh/Patch') {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: rcpNames.inChPatch,
                    }
                } else if (rcpLabel == 'DanteOutPort/Patch') {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: rcpNames.danteOutPatch,
                    }
                } else if (rcpLabel == 'OmniOutPort/Patch') {
                    valParams = {
                        type: 'dropdown',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        minChoicesForSearch: 0,
                        choices: rcpNames.omniOutPatch,
                    }
                } else {
                    valParams = {
                        type: 'textinput',
                        label: rcpLabels[rcpLabelIdx],
                        id: 'Val',
                        default: rcpCmd.Default,
                        regex: '',
                    }
                }
                break

            default:

                return newAction
        }

        newAction.options.push(valParams)


        return newAction
    },

	// Create the proper command string for an action or poll
	parseCmd: async (instance, prefix, rcpCmd, opt) => {

		console.log("rcpCmd: ",rcpCmd, "opt: ", opt)

		if (rcpCmd == undefined || opt == undefined) return

		let scnPrefix = ''
		
		let optX = opt.X === undefined ? 1 : await instance.parseVariablesInString(opt.X)

console.log(`\nvalue of ${opt.X} = `, optX, "\n\n")

		let optY = opt.Y === undefined ? 0 : opt.Y - 1
		let optVal
		let rcpCommand = instance.rcpCommands.find((cmd) => cmd.Address == rcpCmd)

console.log("rcpCommand: ", rcpCommand)

		if (rcpCommand == undefined) {
			instance.log('debug', `PARSECMD: Unrecognized command. '${rcpCmd}'`)
			return
		}
		let cmdName = rcpCommand.Address

		switch (rcpCommand.Type) {
			case 'integer':
			case 'binary':
				cmdName = `${prefix} ${cmdName}`
				optVal = ''
				if (prefix == 'set') { // if it's not "set" then it's a "get" which doesn't have a Value
					if (opt.Val == 'Toggle') {
						if (instance.dataStore[rcpCmd] !== undefined && instance.dataStore[rcpCmd][optX] !== undefined) {
							optVal = 1 - parseInt(instance.dataStore[rcpCmd][optX][optY + 1])
						}
					} else {
						optVal = opt.Val

						if (opt.Rel != undefined && opt.Rel == true) {
							if (instance.dataStore[rcpCmd] !== undefined && instance.dataStore[rcpCmd][optX] !== undefined) {
								let curVal = parseInt(instance.dataStore[rcpCmd][optX][optY + 1])
								// Handle bottom of range
								if (curVal == -32768 && optVal > 0) {
									curVal = -9600
								} else if (curVal == -9600 && optVal < 0) {
									curVal = -32768
								}
								optVal = curVal + optVal
							}
						}
					}
				}
				optX-- // ch #'s are 1 higher than the parameter
				break

			case 'string':
				cmdName = `${prefix} ${cmdName}`
				instance.parseVariablesInString(opt.Val).then((value) => {
					optVal = (prefix == 'set') ? `"${value}"` : '' // quotes around the string
				})
				optX-- // ch #'s are 1 higher than the parameter except with Custom Banks
				break

			case 'scene':
				if (instance.config.model == 'PM') {
					optX = `"${opt.X}"`
				}
				optY = ''
				optVal = ''

				if (prefix == 'set') {
					scnPrefix = (instance.config.model == 'PM') ? 'ssrecallt_ex' : 'ssrecall_ex'
					//instance.pollrcp() // so buttons with feedback reflect any changes?
				} else {
					scnPrefix = (instance.config.model == 'PM') ? 'sscurrentt_ex' : 'sscurrent_ex'
					optX = ''
				}

				if (instance.config.model != 'TF') {
					cmdName = `${scnPrefix} ${cmdName}` // Recall Scene for CL/QL & Rivage
				} else {
					cmdName = `${scnPrefix} ${cmdName}${opt.Y}` // Recall Scene for TF
				}
		}

		return `${cmdName} ${optX} ${optY} ${optVal}`.trim() // Command string to send to console
	}

    
}