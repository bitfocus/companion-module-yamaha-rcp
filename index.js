// Control module for Yamaha Pro Audio, using SCP communication
// Jack Longden <Jack@atov.co.uk> 2019
// updated by Andrew Broughton <andy@checkcheckonetwo.com> Feb 2020

var tcp 			= require('../../tcp');
var instance_skel 	= require('../../instance_skel');
var scpNames 		= require('./scpNames.json');
var bankState 		= {};
var scpVal 			= [];	// Keeps track of values returned for Feedback purposes
var curScpVal		= {};

const SCP_PARAMS 	= ['Ok', 'Command', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale'];
const SCP_VALS 		= ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal'];


// Instance Setup
function instance(system, id, config) {
	var self 		= this;
	
	var scpCommands = [];
	var productName = '';

	// config._configIdx = undefined;

	// super-constructor
	instance_skel.apply(this, arguments);

	// Upgrade  1.0.x > 1.1.0
	self.addUpgradeScript(function (config, actions, releaseActions, feedbacks) {
		var changed = false;

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
				action.label = self.id + ':' + action.action;
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
	self.addUpgradeScript(function (config, actions, releaseActions, feedbacks) {
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
				action.label = self.id + ':' + action.action;
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
	});

	return self;
}


// Web config fields
instance.prototype.config_fields = function () {
	var self = this;

	return [{
				type: 		'textinput',
				id: 		'host',
				label: 		'IP Address of Console',
				width: 		6,
				default: 	'192.168.0.128',
				regex: 		self.REGEX_IP
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
			}
	]
}

// Change in Configuration
instance.prototype.updateConfig = function(config) {
	var self  = this;
	
	let fname = '';
	const FS  = require("fs");
	
	self.config = config;
	
	if(self.config.model == 'CL/QL') {
		fname = 'CL5 SCP Parameters-1.txt';
	}
	else {
		fname = 'TF5 SCP Parameters-1.txt';
	}

	// Read the DataFile
	var data = FS.readFileSync(`${__dirname}/${fname}`);
	self.scpCommands = self.parseData(data, SCP_PARAMS);

	self.scpCommands.sort((a, b) => {
		let acmd = a.Address.slice(a.Address.indexOf("/") + 1);
		let bcmd = b.Address.slice(b.Address.indexOf("/") + 1);
		return acmd.toLowerCase().localeCompare(bcmd.toLowerCase());
	})
	
	self.newConsole();
}

// Startup
instance.prototype.init = function() {
	var self = this;

	self.updateConfig(self.config);
}

// Make each command line into an object that can be used to create the commands
instance.prototype.parseData = function(data, params) {
	var self    = this;
	
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
		}		
	}
	return cmds
}


// Whenever the console type changes, update the info
instance.prototype.newConsole = function() {
	var self = this;

	self.log('info', `Device model= ${self.config.model}`);
	
	self.init_tcp();
	self.actions(); // Re-do the actions once the console is chosen
}


// Get info from a connected console
instance.prototype.getConsoleInfo = function() {
	var self = this;

	self.socket.send(`devinfo productname`);
}

// Initialise TCP
instance.prototype.init_tcp = function() {
	var self          = this;
	
	let receivebuffer = '';
	let receivedcmd   = [];
	let foundCmd	  = {};
	let cmdIndex      = -1;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

	if (self.config.host) {
		self.socket = new tcp(self.config.host, 49280 );

		self.socket.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.socket.on('error', function (err) {
			self.status(self.STATE_ERROR, err);
			self.log('error', `Network error: ${err.message}`);
		});

		self.socket.on('connect', function () {
			self.status(self.STATE_OK);
			self.log('info', `Connected`);
			self.getConsoleInfo();
		});

		self.socket.on('data', function (chunk) {
			receivebuffer += chunk;
			
			self.log('debug', `Received from device: ${receivebuffer}`);

			if(receivebuffer.indexOf('OK devinfo productname') !== -1) {
				self.productName = receivebuffer.slice(receivebuffer.lastIndexOf(" "));
				self.log('info', `Device found: ${self.productName}`);
			} else {
				receivedcmd = self.parseData(receivebuffer, SCP_VALS); // Break out the parameters
				for(let i=0; i < receivedcmd.length; i++){
					foundCmd = self.scpCommands.find(cmd => cmd.Address == receivedcmd[i].Address); // Find which command
					if(foundCmd !== undefined){
						cmdIndex = foundCmd.Index; // Find which command
						scpVal.push({i: 'scp_' + cmdIndex, cmd: receivedcmd[i]});
						do{
							curScpVal = scpVal.shift();
							self.checkFeedbacks(curScpVal.i);
						} while(scpVal.length > 0);
					} else {
						self.log('debug', `Unknown command received: ${receivedcmd[i].Address}`);
					}
				}
			}
			
			receivebuffer = '';	// Clear the buffer
		
    });
	}
}

// Module deletion
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	self.log('debug', `destroyed ${self.id}`);
}

// Module actions
instance.prototype.actions = function(system) {
	var self      = this;
	
	var commands  = {};
	var feedbacks = {};
	let scpCmd    = {};
	let valParams = {};

	for (let i = 0; i < self.scpCommands.length; i++){
		
		scpCmd = self.scpCommands[i]
	
		if(self.config.model == 'TF' && scpCmd.Type == 'scene'){
			scpLabel = 'Scene/Bank'
		} else {
			scpLabel = scpCmd.Address.slice(scpCmd.Address.indexOf("/") + 1); // String after "MIXER:Current/"
		}
		
		// Add the commands from the data file. Action id's (action.action) are the SCP command number
		let scpAction = 'scp_' + scpCmd.Index
		
		commands[scpAction] = {
			label: scpLabel, 
			options: [
				{type: 'number', label: scpLabel.split("/")[0], id: 'X', min: 1, max: scpCmd.X, default: 1, required: true, range: false}]
		}

		if(scpCmd.Y > 1) {
			if(self.config.model == "TF" && scpCmd.Type == 'scene'){
				valParams = {type: 'dropdown', label: scpLabel.split("/")[1], id: 'Y', default: 'A', choices:[
					{id: 'A', label: 'A'},
					{id: 'B', label: 'B'}
				]}
			}
			else {
				valParams = {type: 'number', label: scpLabel.split("/")[1], id: 'Y', min: 1, max: scpCmd.Y, default: 1, required: true, range: false
			}
		}
      
			commands[scpAction].options.push(valParams);
		}
		switch(scpCmd.Type) {
			case 'integer':
				if(scpCmd.Max == 1) {
					valParams = {type: 'checkbox', label: 'On', id: 'Val', default: scpCmd.Default}
				}
				else{
					valParams = {
						type: 'number', label: scpLabel.split("/")[2], id: 'Val', min: scpCmd.Min, max: scpCmd.Max, default: parseInt(scpCmd.Default), required: true, range: false
					}
				}
				break;
			case 'string':
				if(scpLabel.startsWith("CustomFaderBank")) {
					valParams = {type: 'dropdown', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, choices: scpNames.chNames}
				} else if(scpLabel.endsWith("Color")) {
					valParams = {type: 'dropdown', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, choices: scpNames.chColors}
				} else {
					valParams = {type: 'textinput', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, regex: ''}
				}
				break;
			default:
				feedbacks[scpAction] = JSON.parse(JSON.stringify(commands[scpAction])); // Clone
				feedbacks[scpAction].options.push(
					{type: 'colorpicker', label: 'Forground Colour', id: 'fg', default: this.rgb(0,0,0)},
					{type: 'colorpicker', label: 'Background Colour', id: 'bg', default: this.rgb(255,0,0)}
				)
				continue; // Don't push another parameter - In the case of a Scene message
		}
		
		commands[scpAction].options.push(valParams);
		
		feedbacks[scpAction] = JSON.parse(JSON.stringify(commands[scpAction])); // Clone
		feedbacks[scpAction].options.push(
				{type: 'colorpicker', label: 'Forground Colour', id: 'fg', default: this.rgb(0,0,0)},
				{type: 'colorpicker', label: 'Background Colour', id: 'bg', default: this.rgb(255,0,0)}
		)
	}
	
	self.setActions(commands);
	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.action = function(action) {
	var self       = this;
	
	var opt        = action.options;
	let optX       = opt.X
	let optY       = ((opt.Y === undefined) ? 0 : opt.Y - 1);
	let optVal     = ''
	let scpCommand = self.scpCommands.find(cmd => 'scp_' + cmd.Index == action.action); // Find which command
	
	if(scpCommand == undefined) {
		self.log('debug',`Invalid command: ${action.action}`)
		return;
	} 
	let cmdName = scpCommand.Address;
	
	switch(scpCommand.Type) {
		case 'integer':
			cmdName = `set ${cmdName}`
			optX--; 				// ch #'s are 1 higher than the parameter
			optVal = 0 + opt.Val; 	// Changes true/false to 1 0

			break;
		
		case 'string':
			cmdName = `set ${cmdName}`
			optX--; 				// ch #'s are 1 higher than the parameter except with Custom Banks
			optVal = `"${opt.Val}"` // quotes around the string
			break;

		case 'scene':
			optY = '';
			optVal = '';
			if(self.config.model == 'CL/QL') {
				cmdName = `ssrecall_ex ${cmdName}`  		// Recall Scene for CL/QL
			}
			else{
				cmdName = `ssrecall_ex ${cmdName}${opt.Y}` 	// Recall Scene for TF
			}
	}		
	
	cmd = `${cmdName} ${optX} ${optY} ${optVal}`.trim(); 	// Command string to send to console
	
	if (cmd !== undefined) {
		self.log('debug', `sending ${cmd} to ${self.config.host}`);

		if (self.socket !== undefined && self.socket.connected) {
			self.socket.send(cmd + "\n"); 					// send it, but add a CR to the end
		}
		else {
			self.log('info', 'Socket not connected :(');
		}
	}
}

instance.prototype.feedback = function(feedback, bank){
	var self       = this;
	
	let options    = feedback.options;
	let scpCommand = self.scpCommands.find(cmd => 'scp_' + cmd.Index == feedback.type);
		
	if((curScpVal.cmd !== undefined) && (scpCommand !== undefined)) {
		let Valopt = ((scpCommand.Type == 'integer') ? 0 + options.Val : `${options.Val}`) 	// 0 + value turns true/false into 1 0
		let ofs = ((scpCommand.Type == 'scene') ? 0 : 1); 									// Scenes are equal, channels are 1 higher
		
		if(bankState[bank.text] == undefined) {
			bankState[bank.text] = {color: bank.color, bgcolor: bank.bgcolor}
		}

		/*
		console.log(`Feedback: ${feedback.type}:${curScpVal.cmd.Address}`);
		console.log(`options.X: ${options.X}, curScpVal.X: ${parseInt(curScpVal.cmd.X) + ofs}`);
		console.log(`options.Y: ${options.Y}, curScpVal.Y: ${parseInt(curScpVal.cmd.Y) + ofs}`);
		console.log(`Valopt: ${Valopt}, curScpVal.Val: ${curScpVal.cmd.Val}\n`);
		*/

		if(options.X == parseInt(curScpVal.cmd.X) + ofs)
			if((options.Y == undefined) || (options.Y == parseInt(curScpVal.cmd.Y) + ofs))
				if((curScpVal.cmd.Val == undefined) || (Valopt == curScpVal.cmd.Val)) {
					bankState[bank.text] = {color: options.fg, bgcolor: options.bg};
		}
	} 
	
	return bankState[bank.text]; // return the old value if no match, but the new value if there is a match
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;