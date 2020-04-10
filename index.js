// Control module for Yamaha Pro Audio, using SCP communication
// Jack Longden <Jack@atov.co.uk> 2019
// updated by Andrew Broughton <andy@checkcheckonetwo.com>
// Mar 28, 2020 Version 1.3.5 

var tcp 			= require('../../tcp');
var instance_skel 	= require('../../instance_skel');
var scpNames 		= require('./scpNames.json');
var upgrade			= require('./upgrade');

const SCP_PARAMS 	= ['Ok', 'Command', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale'];
const SCP_VALS 		= ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal'];


// Instance Setup
class instance extends instance_skel {
	
	constructor(system, id, config) {
		super(system, id, config);

		Object.assign(this, {
			...upgrade,
		});
		
		this.scpCommands   = [];
		this.nameCommands  = []; 	// Commands which have a name field
		this.colorCommands = [];	// Commands which have a color field
		this.scpPresets    = [];
		this.productName   = '';
		this.scpVal 	   = [];	// Keeps track of values returned for Feedback purposes
		this.curScpVal	   = {};
		this.bankState 	   = new Object();
		this.macroRec      = false;
		this.macroCount    = 0;

		this.addUpgradeScripts();
	}


	// Startup
	init() {
		this.updateConfig(this.config);
	}


	// Module deletion
	destroy() {
	
		if (this.socket !== undefined) {
			this.socket.destroy();
		}

		this.log('debug', `destroyed ${this.id}`);
	}


	// Web config fields
	config_fields() {
		
		return [{
				type: 		'textinput',
				id: 		'host',
				label: 		'IP Address of Console',
				width: 		6,
				default: 	'192.168.0.128',
				regex: 		this.REGEX_IP
			},
			{
				type: 		'dropdown',
				id: 		'model',
				label: 		'Console Type',
				width: 		6,
				default: 	'CL/QL',
				choices: [
					{id: 'CL/QL', label: 'CL/QL Console'},
					{id: 'TF', label: 'TF Console'}
				]
			},
			{
				type: 		'number',
				id: 		'myCh',
				label: 		'"My" Channel',
				width:		6,
				min: 		1,
				max: 		72,
				default: 	1,
				required: 	false
			}
		]
	}

	
	// Change in Configuration
	updateConfig(config) {
		
		let fname = '';
		const FS  = require("fs");
		
		this.config = config;
		
		if(this.config.model == 'CL/QL') {
			fname = 'CL5 SCP Parameters-1.txt';
		}
		else {
			fname = 'TF5 SCP Parameters-1.txt';
		}

		// Read the DataFile
		let data = FS.readFileSync(`${__dirname}/${fname}`);
		this.scpCommands = this.parseData(data, SCP_PARAMS);

		this.scpCommands.sort((a, b) => {
			let acmd = a.Address.slice(a.Address.indexOf("/") + 1);
			let bcmd = b.Address.slice(b.Address.indexOf("/") + 1);
			return acmd.toLowerCase().localeCompare(bcmd.toLowerCase());
		})
		
		this.newConsole();
	}


	// Whenever the console type changes, update the info
	newConsole() {
		
		this.log('info', `Device model= ${this.config.model}`);
		
		this.init_tcp();
		this.actions(); // Re-do the actions once the console is chosen
		this.presets();
	}


	// Make each command line into an object that can be used to create the commands
	parseData(data, params) {
		
		let cmds    = [];
		let line    = [];
		const lines = data.toString().split("\x0A");
		
		for (let i = 0; i < lines.length; i++){
			// I'm not going to even try to explain this next line,
			// but it basically pulls out the space-separated values, except for spaces those that are inside quotes!
			line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)
			if(line !== null && (['OK','NOTIFY'].indexOf(line[0].toUpperCase()) !== -1)){
				let scpCommand = new Object();
				
				for (var j = 0; j < line.length; j++){
					scpCommand[params[j]] = line[j].replace(/"/g,'');  // Get rid of any double quotes around the strings
				}
				cmds.push(scpCommand);

				if(params === SCP_PARAMS) {
					let cmdArr = undefined;
					switch(scpCommand.Address.slice(-4)) {
						case 'Name':
							cmdArr = this.nameCommands;
							break;
						case 'olor':
							cmdArr = this.colorCommands;
					}
					if(cmdArr !== undefined) cmdArr.push('scp_' + scpCommand.Index);
				}
			}		
		}
		return cmds
	}


	// Get info from a connected console
	getConsoleInfo() {
		this.socket.send(`devinfo productname\n`);
	}


	// Initialize TCP
	init_tcp() {
		
		let receivebuffer  = '';
		let receivedLines  = [];
		let receivedcmds   = [];
		let foundCmd	   = {};
		
		if (this.socket !== undefined) {
			this.socket.destroy();
			delete this.socket;
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, 49280);

			this.socket.on('status_change', (status, message) => {
				this.status(status, message);
			});

			this.socket.on('error', (err) => {
				this.status(this.STATUS_ERROR, err);
				this.log('error', `Network error: ${err.message}`);
			});

			this.socket.on('connect', () => {
				this.status(this.STATUS_OK);
				this.log('info', `Connected!`);
				this.getConsoleInfo();
				this.pollScp();
			});

			this.socket.on('data', (chunk) => {
				receivebuffer += chunk;
				
				receivedLines = receivebuffer.split("\x0A");	// Split by line break


				for(let line of receivedLines){
					if(line.length == 0) continue;

					this.log('debug', `Received from device: '${line}'`);

					if(line.indexOf('OK devinfo productname') !== -1) {
					
						this.productName = line.slice(receivebuffer.lastIndexOf(" "));
						this.log('info', `Device found: ${this.productName}`);
					
					} else {
					
						receivedcmds = this.parseData(line, SCP_VALS); // Break out the parameters
						for(let i=0; i < receivedcmds.length; i++) {
							foundCmd = this.scpCommands.find(cmd => cmd.Address == receivedcmds[i].Address.slice(0,cmd.Address.length)); // Find which command
							if(foundCmd !== undefined) {
							
								this.scpVal.push({scp: foundCmd, cmd: receivedcmds[i]});
								do {
									this.curScpVal = this.scpVal.shift();
									this.addMacro(this.curScpVal);
									this.checkFeedbacks('scp_' + this.curScpVal.scp.Index);
								} while(this.scpVal.length > 0);
							
							} else {
							
								this.log('debug', `Unknown command received: '${receivedcmds[i].Address}'`);
							
							}
						}
					}
				}				
				
				receivebuffer = '';	// Clear the buffer
			
			});
		}
	}



	// Create single Action/Feedback
	createAction(scpCmd) {
		
		let newAction = {};
		let valParams = {};
		let scpLabel  = '';

		if(this.config.model == 'TF' && scpCmd.Type == 'scene') {
			scpLabel = 'Scene/Bank'
		} else {
			scpLabel = scpCmd.Address.slice(scpCmd.Address.indexOf("/") + 1); // String after "MIXER:Current/"
		}
		
		// Add the commands from the data file. Action id's (action.action) are the SCP command number
		let scpLabels = scpLabel.split("/");
		let scpLabelIdx = (scpLabel.startsWith("Cue")) ? 1 : 0;
		
		newAction = {label: scpLabel, options: []};
		if(scpCmd.X > 1) {
			if(scpLabel.startsWith("InCh") || scpLabel.startsWith("Cue/InCh")) {
				newAction.options = [
					{type: 'dropdown', label: scpLabels[scpLabelIdx], id: 'X', default: 1, choices: scpNames.chNames}
				]
			} else {
				newAction.options = [
					{type: 'number', label: scpLabels[scpLabelIdx], id: 'X', min: 1, max: scpCmd.X, default: 1, required: true, range: false}
				]
			}
			scpLabelIdx++;
		}

		if(scpCmd.Y > 1) {
			if(this.config.model == "TF" && scpCmd.Type == 'scene') {
				valParams = {type: 'dropdown', label: scpLabels[scpLabelIdx], id: 'Y', default: 'a', choices:[
					{id: 'a', label: 'A'},
					{id: 'b', label: 'B'}
				]}
			} else {
				valParams = {type: 'number', label: scpLabels[scpLabelIdx], id: 'Y', min: 1, max: scpCmd.Y, default: 1, required: true, range: false}
			}

			newAction.options.push(valParams);
		}
		
		if(scpLabelIdx < scpLabels.length - 1) scpLabelIdx++;
		
		switch(scpCmd.Type) {
			case 'integer':
			case 'binary':
				if(scpCmd.Max == 1) {
					valParams = {type: 'checkbox', label: 'On', id: 'Val', default: scpCmd.Default}
				} else {
					valParams = {
						type: 'number', label: scpLabels[scpLabelIdx], id: 'Val', min: scpCmd.Min, max: scpCmd.Max, default: parseInt(scpCmd.Default), required: true, range: false
					}
				}
				break;
			case 'string':
				if(scpLabel.startsWith("CustomFaderBank")) {
					valParams = {type: 'dropdown', label: scpLabels[scpLabelIdx], id: 'Val', default: scpCmd.Default, choices: scpNames.customChNames}
				} else if(scpLabel.endsWith("Color")) {
					valParams = {type: 'dropdown', label: scpLabels[scpLabelIdx], id: 'Val', default: scpCmd.Default, 
					choices: this.config.model == "TF" ? scpNames.chColorsTF : scpNames.chColors}
				} else {
					valParams = {type: 'textinput', label: scpLabels[scpLabelIdx], id: 'Val', default: scpCmd.Default, regex: ''}
				}
				break;
			default:
				return newAction;
		}
			
		newAction.options.push(valParams);
		return newAction;
		
	}

	
	// Create the Actions & Feedbacks
	actions(system) {
		
		let commands  = {};
		let feedbacks = {};
		let command   = {};
		let scpAction = '';

		for (let i = 0; i < this.scpCommands.length; i++) {
			command = this.scpCommands[i]
			scpAction = 'scp_' + command.Index;
		
			commands[scpAction] = this.createAction(command);
			feedbacks[scpAction] = JSON.parse(JSON.stringify(commands[scpAction])); // Clone the Action to a matching feedback

			if(this.nameCommands.includes(scpAction) || this.colorCommands.includes(scpAction)) {
				feedbacks[scpAction].options.pop();
			} else {
				feedbacks[scpAction].options.push(
					{type: 'colorpicker', label: 'Color', id: 'fg', default: this.rgb(0,0,0)},
					{type: 'colorpicker', label: 'Background', id: 'bg', default: this.rgb(255,0,0)}
				)
			}
		}

		commands['macroRecStart'] = {label: 'Record SCP Macro'};
		commands['macroRecStop'] = {label: 'Stop Recording'};

		feedbacks['macroRecStart'] = {label: 'Macro is Recording', options: [
			{type: 'checkbox', label: 'ON', id: 'on', default: true},
			{type: 'colorpicker', label: 'Color', id: 'fg', default: this.rgb(0,0,0)},
			{type: 'colorpicker', label: 'Background', id: 'bg', default: this.rgb(255,0,0)}
		]};

/*
this.log('info','******** COMMAND LIST *********');
Object.entries(commands).forEach(([key, value]) => this.log('info',`<font face="courier">${value.label.padEnd(36, '\u00A0')} ${key}</font>`));
this.log('info','***** END OF COMMAND LIST *****')
*/

		this.setActions(commands);
		this.setFeedbackDefinitions(feedbacks);
	}

	
	// Create the proper command string for an action or poll
	parseCmd(prefix, scpCmd, opt) {
		
		if(scpCmd == undefined || opt == undefined) return;

		let scnPrefix  = '';
		let optX       = (opt.X === undefined) ? 1 : (opt.X > 0) ? opt.X : this.config.myCh;
		let optY       = (opt.Y === undefined) ? 0 : opt.Y - 1;
		let optVal
		let scpCommand = this.scpCommands.find(cmd => 'scp_' + cmd.Index == scpCmd);
		if(scpCommand == undefined) {
			this.log('debug',`PARSECMD: Unrecognized command. '${scpCmd}'`)
			return;
		} 
		let cmdName = scpCommand.Address;			
		
		switch(scpCommand.Type) {
			case 'integer':
			case 'binary':
				cmdName = `${prefix} ${cmdName}`
				optX--; 				// ch #'s are 1 higher than the parameter
				optVal = ((prefix == 'set') ? 0 + opt.Val : ''); 	// Changes true/false to 1 0
				break;
			
			case 'string':
				cmdName = `${prefix} ${cmdName}`
				optX--; 				// ch #'s are 1 higher than the parameter except with Custom Banks
				optVal = ((prefix == 'set') ? `"${opt.Val}"` : ''); // quotes around the string
				break;
	
			case 'scene':
				optY = '';
				optVal = '';
	
				if(prefix == 'set') {
					scnPrefix = 'ssrecall_ex';
					this.pollScp();		// so buttons with feedback reflect any changes
				} else {
					scnPrefix = 'sscurrent_ex';
					optX = '';
				}
	
				if(this.config.model == 'CL/QL') {
					cmdName = `${scnPrefix} ${cmdName}`;  		// Recall Scene for CL/QL
				} else {
					cmdName = `${scnPrefix} ${cmdName}${opt.Y}`; 	// Recall Scene for TF
				}
		}		
		
		return `${cmdName} ${optX} ${optY} ${optVal}`.trim(); 	// Command string to send to console
	}

	
	// Create the preset definitions
	presets() {
		this.scpPresets = [{
			category: 'Macros',
			label: 'Create Macro',
			bank: {
				style: 'text',
				text: 'Record SCP Macro',
				latch: true,
				size: '14',
				color: this.rgb(255,255,255),
				bgcolor: this.rgb(0,0,0)
			},
			actions: 			[{action: 'macroRecStart'}],
			release_actions: 	[{action: 'macroRecStop'}],
			feedbacks: 			[{type:   'macroRecStart', options: {on: true}}]
		}];
	
		this.setPresetDefinitions(this.scpPresets);
	}

	
	// Add a command to a Macro Preset
	addMacro(c) {

		let foundActionIdx = -1;

		if(this.macroRec) {
			let cX = parseInt(c.cmd.X);
			let cY = parseInt(c.cmd.Y);
			let cV

			switch(c.scp.Type) {
				case 'integer':
				case 'binary':
					cX++;
					cY++;
					if(c.scp.Max == 1) {
						cV = ((c.cmd.Val == 0) ? false : true)
					} else {
						cV = parseInt(c.cmd.Val);
					}
					break;
				case 'string':
					cX++;
					cY++;
					cV = c.cmd.Val;
					break;
			}
			
			// Check for new value on existing action
			let scpActions = this.scpPresets[this.scpPresets.length - 1].actions;
			if(scpActions !== undefined) {
				foundActionIdx = scpActions.findIndex(cmd => (
					cmd.action == 'scp_' + c.scp.Index && 
					cmd.options.X == cX &&
					cmd.options.Y == cY
				));
			}
			
			if(foundActionIdx == -1) {
				scpActions.push([]);
				foundActionIdx = scpActions.length - 1;
			}

			scpActions[foundActionIdx] = {action: 'scp_' + c.scp.Index, options: {X: cX, Y: cY, Val: cV}};

		}
	}

	
	// Handle the Actions
	action(action) {

		if(!action.action.startsWith('macro')){
			let cmd = this.parseCmd('set', action.action, action.options);
			if (cmd !== undefined) {
				this.log('debug', `sending '${cmd}' to ${this.config.host}`);

				if (this.socket !== undefined && this.socket.connected) {
					this.socket.send(`${cmd}\n`); 					// send it, but add a CR to the end
				}
				else {
					this.log('info', 'Socket not connected :(');
				}
			}	
		} else {
			if(action.action == 'macroRecStart' && this.macroRec == false) {
				this.macroCount++;
				this.scpPresets.push({
					category: 'Macros',
					label: `Macro ${this.macroCount}`,
					bank: {
						style: 'text',
						text: `Macro ${this.macroCount}`,
						size: '18',
						color: this.rgb(255,255,255),
						bgcolor: this.rgb(0,0,0)
					},
					actions: []
				});
				this.macroRec = true;

			} else if(action.action == 'macroRecStop') {
				this.macroRec = false;
				if(this.scpPresets[this.scpPresets.length - 1].actions.length > 0) {
					this.setPresetDefinitions(this.scpPresets);
				} else {
					this.scpPresets.pop();
					this.macroCount = 0;
				}
			}
			this.checkFeedbacks('macroRecStart');
		}

	}
	

	// Handle the Feedbacks
	feedback(feedback, bank) {

		const NO_CHANGE = 0b10;
		const MATCH     = 0b01;
		
		let match 	    = 0;
		let options     = feedback.options;
		let scpCommand  = this.scpCommands.find(cmd => 'scp_' + cmd.Index == feedback.type);

		let fbid = feedback.id;

//		console.log(`Page: ${fbPB.pg}, Bank: ${fbPB.bk}`);

		if((fbid !== undefined) && (this.curScpVal.cmd !== undefined) && (scpCommand !== undefined)) {
			let optVal = (options.Val == undefined ? undefined : (scpCommand.Type == 'integer') ? 0 + options.Val : `${options.Val}`) 	// 0 + value turns true/false into 1 0
			let ofs = ((scpCommand.Type == 'scene') ? 0 : 1); 									// Scenes are equal, channels are 1 higher
			
			if(this.bankState[fbid] == undefined) {
				this.bankState[fbid] = {text: bank.text, color: bank.color, bgcolor: bank.bgcolor}
			}
			
/*
			console.log(`Feedback: ${feedback.id} = ${feedback.type} (${this.curScpVal.cmd.Address})`);
			console.log(`options.X: ${options.X}, this.curScpVal.X: ${parseInt(this.curScpVal.cmd.X) + ofs}`);
			console.log(`options.Y: ${options.Y}, this.curScpVal.Y: ${parseInt(this.curScpVal.cmd.Y) + ofs} (or '${this.curScpVal.cmd.Address.slice(-1)}')`);
			console.log(`options.Val: ${options.Val}, optVal: ${optVal}, this.curScpVal.Val: ${this.curScpVal.cmd.Val}`);
*/
			
			let optX = (options.X > 0) ? options.X : this.config.myCh;
			if(optX == parseInt(this.curScpVal.cmd.X) + ofs){
				match = MATCH;
			} else {
				match = NO_CHANGE;
			}

//			console.log(`x-match = ${match}`);

			if(options.Y !== undefined) {
				if(this.curScpVal.cmd.Address.slice(0, -1) !== 'scene_'){
					if(options.Y !== parseInt(this.curScpVal.cmd.Y) + ofs) {
						match = NO_CHANGE;
					}
				} else {
					// for TF Scene messages. Address will be 'scene_a' or 'scene_b'
					if(options.Y !== this.curScpVal.cmd.Address.slice(-1)) {
						match = NO_CHANGE;
					}
				}
			}

//			console.log(`y-match = ${match}`);

			if(optVal !== undefined) {
				if(match == MATCH) {
					if(optVal == this.curScpVal.cmd.Val) {
						match = MATCH;
					} else {
						match = 0;
					}
				}
			} else {
				if(this.curScpVal.cmd.Val == undefined) match = (match | MATCH);
			}
			
//			console.log(`final match = ${match}`);

			if(match == MATCH) {
//				console.log('Match!');
				this.bankState[fbid] = {text: bank.text, color: options.fg, bgcolor: options.bg};
				
				if(this.curScpVal.cmd.Val !== undefined) {
					if(this.nameCommands.includes(feedback.type)) this.bankState[fbid] = {text: this.curScpVal.cmd.Val};
					if(this.colorCommands.includes(feedback.type)) this.bankState[fbid] = scpNames.chColorRGB[this.curScpVal.cmd.Val];
				}
			
			} else if(match !== NO_CHANGE) {
//				console.log('No Match');
				this.bankState[fbid] = {text: bank.text, color: bank.color, bgcolor: bank.bgcolor}
			}
//			console.log(this.bankState[fbid]);

			return this.bankState[fbid]; // return the old value if no match, but the new value if there is a match	
		}
		
		if(feedback.type == 'macroRecStart' && options.on == this.macroRec) {
			return {color: options.fg, bgcolor: options.bg}
		}

		return;
//		console.log('\n');
	}


	// Poll the console for it's status to update buttons via feedback

	pollScp() {
		let allFeedbacks = this.getAllFeedbacks();
		for (let fb in allFeedbacks) {
			let cmd = this.parseCmd('get', allFeedbacks[fb].type, allFeedbacks[fb].options);
			if(cmd !== undefined && this.id == allFeedbacks[fb].instance_id) {
				this.log('debug', `sending '${cmd}' to ${this.config.host}`);
				this.socket.send(`${cmd}\n`)
			}				
		}
	}


}

exports = module.exports = instance;