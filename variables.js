/*
// Handle all the user variables (to-do)
*/

module.exports = {

    addVariables() {
        this.setVariableDefinitions([
            {
                label: 'Scene Name',
                name:  'sceneName'
            }
        ]);
    },

    checkVariables(cS) {
        console.log(`Checking Variables.`);
        console.log(`Passed: ${JSON.stringify(cS,null,4)}`);

    }

}