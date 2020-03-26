/*
// Do the upgrades of actions, release actions and feedback
*/

module.exports = {

    addUpgradeScripts() {

        console.log('Running upgrade script.');
        
        // Upgrade  1.0.x > 1.1.0
        this.addUpgradeScript((config, actions, releaseActions, feedbacks) => {
            var changed = false;
            console.log('Running 1.1.1 -> 1.1.2 Upgrade.')
        
            let checkUpgrade = function(action, changed) {
                let newAction = '';

                switch (action.action) {
                        case 'InChOn':
                            // cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 1';
                            newAction          = 186;
                            action.options.X   = actions.options.Ch;
                            action.options.Val = 1;
                            break;
                        case 'InChOff':
                            // cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 0';
                            newAction          = 186;
                            action.options.X   = actions.options.Ch;
                            action.options.Val = 0;
                            break;
                        case 'InChLevel':
                            // cmd = 'set MIXER:Current/InCh/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
                            newAction          = 184;
                            action.options.X   = action.options.Ch;
                            action.options.Val = action.options.ChAct;
                            break;
                        case 'AuxOn', 'MixOn':
                            // cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 1';
                            newAction          = 187;
                            action.options.X   = action.options.Ch;
                            action.options.Val = 1;
                            break;
                        case 'AuxOff', 'MixOff':
                            // cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 0';
                            newAction          = 187;
                            action.options.X   = action.options.Ch;
                            action.options.Val = 0;
                            break;
                        case 'AuxLevel', 'MixLevel':
                            // cmd = 'set MIXER:Current/Mix/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
                            newAction 			= 185;
                            action.options.X 	= action.options.Ch;
                            action.options.Val 	= action.options.ChAct;
                            break;
                        case 'MtrxOn':
                            // cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 1';
                            newAction          = 7;
                            action.options.X   = action.options.Ch;
                            action.options.Val = 1;
                            break;
                        case 'MtrxOff':
                            // cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 0';
                            newAction          = 7;
                            action.options.X   = action.options.Ch;
                            action.options.Val = 0;
                            break;
                        case 'MtrxLevel':
                            // cmd = 'set MIXER:Current/Mtrx/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
                            newAction          = 2;
                            action.options.X   = action.options.Ch;
                            action.options.Val = action.options.ChAct;
                            break;
                        case 'TFRecall':
                            // cmd = 'ssrecall_ex scene_'+ opt.Bank + ' ' + opt.Scene;
                            newAction        = 1000;
                            action.options.X = action.options.Scene;
                            action.options.Y = action.options.Bank;
                            break;
                        case 'CLQLRecall':
                            // cmd = 'ssrecall_ex MIXER:Lib/Scene ' + opt.Scene;
                            newAction        = 1000;
                            action.options.X = action.options.Scene;
                            break;
                }

                if(newAction != '') {
                    console.log(`Action ${action.action} => scp_${newAction}`);
                    action.action = 'scp_' + newAction;
                    action.label = this.id + ':' + action.action;
                    changed = true;
                }

                return changed;
            }

            for (let k in actions) {
                changed = checkUpgrade(actions[k], changed);
            }

            for (let k in releaseActions) {
                changed = checkUpgrade(releaseActions[k], changed);
            }

            return changed;
        });

        // Upgrade  1.1.2 > 1.1.3
    this.addUpgradeScript((config, actions, releaseActions, feedbacks) => {
            console.log('Running 1.1.2 -> 1.1.3 Upgrade.')
            var changed = false;

            let checkUpgrade = function(action, changed) {
                let newAction = '';

                if(action.action.substring(0, 4) != 'scp_') {
                    newAction = action.action;
                } 

                if(newAction != '') {
                    console.log(`Action ${action.action} => scp_${newAction}`);
                    action.action = 'scp_' + newAction;
                    action.label = this.id + ':' + action.action;
                    changed = true;
                }

                return changed;
            }

            for (let k in actions) {
                changed = checkUpgrade(actions[k], changed);
            }

            for (let k in releaseActions) {
                changed = checkUpgrade(releaseActions[k], changed);
            }

            for (let k in feedbacks) {
                changed = checkUpgrade(feedbacks[k], changed);
            }

            return changed;
        })
    }
}