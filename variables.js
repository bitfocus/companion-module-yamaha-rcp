module.exports = {
    
	initVars: (instance) => {
        instance.setVariableDefinitions([
            {variableId: 'modelName', name: 'Console Model Name'},
            {variableId: 'curScene', name: 'Current Scene Number'},
            {variableId: 'curSceneName', name: 'Current Scene Name'},
            {variableId: 'curSceneComment', name: 'Current Scene Comment'}
        ])
    },

    // Get info from a connected console
	getVars: (instance) => {
		instance.sendCmd('devinfo productname')                // Request Console Model
 		if (instance.config.model == 'PM') {
			instance.sendCmd(`scpmode sstype "text"`)          // Scene numbers are text on Rivage
            instance.sendCmd('sscurrentt_ex MIXER:Lib/Scene ') // Request Current Scene Number
		} else {
            instance.sendCmd('sscurrent_ex MIXER:Lib/Scene')
        }
 	},

    setVar: (instance, msg) => {
        console.log('\n\n\nsetVar: msg = \n')
        console.log(msg)
        switch (msg.Command) {
            case 'devinfo' :
                switch (msg.Address) {
                    case 'productname' :
                        instance.setVariableValues({'modelName' : msg.X})
                        break
                }
                break
            case 'ssrecall_ex' :
            case 'sscurrent_ex' :
                instance.setVariableValues({'curScene' : msg.X})
                instance.sendCmd(`ssinfo_ex MIXER:Lib/Scene ${msg.X}`) // Request Current Scene Info once we know what scene we have
                break
            case 'ssinfo_ex' :
                instance.setVariableValues({'curSceneName' : msg.Val.trim()})
                instance.setVariableValues({'curSceneComment' : msg.TxtVal.trim()})
                break
        }
    }
}