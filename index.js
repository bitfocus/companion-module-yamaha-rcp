// Control module for Yamaha Pro Audio, using SCP communication
// Jack Longden <Jack@atov.co.uk> 2019
// updated by Andrew Broughton <andy@checkcheckonetwo.com> Feb 2020

var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var scpNames = require('./scpNames.json');
var scpCommands = [];
var scpVal = {};
var bankState = {};
var productName = '';
const scpParams = ['Ok', 'Command', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale'];
const scpVals = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal'];


// Instance Setup
function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.addUpgradeScript(function (config, actions) {
		var changed = true;

		for (var k in actions) {
			var action = actions[k];
			
			// update the old action names to the new ones
			switch (action.action) {

				case 'InChOn':
					// cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 1';
					action.action = 186;
					action.options.X = actions.options.Ch;
					action.options.Val = 1;
					break;
		
				case 'InChOff':
					// 	cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 0';
					action.action = 186;
					action.options.X = actions.options.Ch;
					action.options.Val = 0;
					break;
		
				case 'InChLevel':
					// cmd = 'set MIXER:Current/InCh/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					action.action = 184;
					action.options.X = action.options.Ch;
					action.options.Val = action.options.ChAct;
					break;
		
				case 'AuxOn', 'MixOn':
					// cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 1';
					action.action = 187;
					action.options.X = action.options.Ch;
					action.options.Val = 1;
					break;
		
				case 'AuxOff', 'MixOff':
					// cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 0';
					action.action = 187;
					action.options.X = action.options.Ch;
					action.options.Val = 0;
					break;
		
				case 'AuxLevel', 'MixLevel':
					// cmd = 'set MIXER:Current/Mix/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					action.action = 185;
					action.options.X = action.options.Ch;
					action.options.Val = action.options.ChAct;
					break;
		
				case 'MtrxOn':
					// cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 1';
					action.action = 7;
					action.options.X = action.options.Ch;
					action.options.Val = 1;
					break;
		
				case 'MtrxOff':
					// cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 0';
					action.action = 7;
					action.options.X = action.options.Ch;
					action.options.Val = 0;
					break;
		
				case 'MtrxLevel':
					// cmd = 'set MIXER:Current/Mtrx/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
					action.action = 2;
					action.options.X = action.options.Ch;
					action.options.Val = action.options.ChAct;
					break;
		
				case 'TFRecall':
					// cmd = 'ssrecall_ex scene_'+ opt.Bank + ' ' + opt.Scene;
					action.action = 1000;
					action.options.X = action.options.Scene;
					action.options.Y = action.options.Bank;
					break;
		
				case 'CLQLRecall':
					// cmd = 'ssrecall_ex MIXER:Lib/Scene ' + opt.Scene;
					action.action = 1000;
					action.options.X = action.options.Scene;
					break;

				default:
					changed = false;
			}

		}

		return changed;
	});

	return self;
}

// Web config fields
instance.prototype.config_fields = function () {
	var self = this;

	return [{
				type: 'textinput',
				id: 'host',
				label: 'IP Address of Console',
				width: 6,
				default: '192.168.0.128',
				regex: self.REGEX_IP
			},
			{
				type: 'dropdown',
				id: 'model',
				label: 'Console Type',
				width: 6,
				default: 'CL/QL',
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
	const fs  = require("fs");
	
	self.config = config;
	if(self.config.model == 'CL/QL'){
		fname = 'CL5 SCP Parameters-1.txt';
	}
	else{
		fname = 'TF5 SCP Parameters-1.txt';
	}

	// Read the DataFile
	var data = fs.readFileSync(`${__dirname}/${fname}`);
	scpCommands = parseData(data, scpParams);
	newConsole(self);
}

// Startup
instance.prototype.init = function() {
	var self = this;

	self.updateConfig(self.config);
}

// Make each command line into an object that can be used to create the commands
function parseData(data, params){
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
function newConsole(self){
	self.log('info', `Device model= ${self.config.model}`);
	
	self.init_tcp();
	self.actions(); // Re-do the actions once the console is chosen
}


// Get info from a connected console
function getConsoleInfo(self) {
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
			getConsoleInfo(self);
		});

		self.socket.on('data', function (chunk) {
			receivebuffer += chunk;
			
			self.log('debug', `Received from device: ${receivebuffer}`);

			if(receivebuffer.indexOf('OK devinfo productname') !== -1){
				productName = receivebuffer.slice(receivebuffer.lastIndexOf(" "));
				self.log('info', `Device found: ${productName}`);
			} else {
				receivedcmd = parseData(receivebuffer, scpVals); // Break out the parameters
				for(let i=0; i < receivedcmd.length; i++){
					cmdIndex = -1;
					foundCmd = scpCommands.find(cmd => cmd.Address == receivedcmd[i].Address); // Find which command
					if(foundCmd !== undefined){
						cmdIndex = foundCmd.Index; // Find which command
						scpVal = receivedcmd[i];
						self.checkFeedbacks(cmdIndex);
					} else {
						self.log('debug', `Unknown command received: ${receivedcmd[i].Address}`);
					}
				}
			}
			
			scpVal = {};
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
	let scpCmd    = '';
	let valParams = {};

	for (let i = 0; i < scpCommands.length; i++){
		
		scpCmd = scpCommands[i]

		if(self.config.model == 'TF' && scpCmd.Type == 'scene'){
			scpLabel = 'Scene/Bank'
		}
		else{
			scpLabel = scpCmd.Address.slice(scpCmd.Address.indexOf("/") + 1); // String after "MIXER:Current/"
		}
		
		// Add the commands from the data file. Action id's (action.action) are the SCP command number
		commands[scpCmd.Index] = {
			label: `${scpCmd.Index}: ${scpLabel}`, 
			options: [
				{type: 'number', label: scpLabel.split("/")[0], id: 'X', min: 1, max: scpCmd.X, default: 1, required: true, range: false}]
		}

		if(scpCmd.Y > 1){
			if(self.config.model == "TF" && scpCmd.Type == 'scene'){
				valParams = {type: 'dropdown', label: scpLabel.split("/")[1], id: 'Y', default: 'A', choices:[
					{id: 'A', label: 'A'},
					{id: 'B', label: 'B'}
				]}
			}
			else{
				valParams = {type: 'number', label: scpLabel.split("/")[1], id: 'Y', min: 1, max: scpCmd.Y, default: 1, required: true, range: false}
      }
      
			commands[scpCmd.Index].options.push(valParams);
		}
		switch(scpCmd.Type){
			case 'integer':
				if(scpCmd.Max == 1){
					valParams = {type: 'checkbox', label: 'On', id: 'Val', default: scpCmd.Default}
				}
				else{
					valParams = {
						type: 'number', label: scpLabel.split("/")[2], id: 'Val', min: scpCmd.Min, max: scpCmd.Max, default: parseInt(scpCmd.Default), required: true, range: false
					}
				}
				break;
			case 'string':
				if(scpLabel.startsWith("CustomFaderBank")){
					valParams = {type: 'dropdown', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, choices: scpNames.chNames}
				} else if(scpLabel.endsWith("Color")){
					valParams = {type: 'dropdown', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, choices: scpNames.chColors}
				} else {
					valParams = {type: 'textinput', label: scpLabel.split("/")[2], id: 'Val', default: scpCmd.Default, regex: ''}
				}
				break;
			default:
				feedbacks[scpCmd.Index] = JSON.parse(JSON.stringify(commands[scpCmd.Index])); // Clone
				feedbacks[scpCmd.Index].options.push(
					{type: 'colorpicker', label: 'Forground Colour', id: 'fg', default: this.rgb(0,0,0)},
					{type: 'colorpicker', label: 'Background Colour', id: 'bg', default: this.rgb(255,0,0)}
				)
				continue; // Don't push another parameter - In the case of a Scene message
		}
		
		commands[scpCmd.Index].options.push(valParams);

		feedbacks[scpCmd.Index] = JSON.parse(JSON.stringify(commands[scpCmd.Index])); // Clone
		feedbacks[scpCmd.Index].options.push(
				{type: 'colorpicker', label: 'Forground Colour', id: 'fg', default: this.rgb(0,0,0)},
				{type: 'colorpicker', label: 'Background Colour', id: 'bg', default: this.rgb(255,0,0)}
		)
	}

	self.system.emit('instance_actions', self.id, commands);
	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.action = function(action) {
	var self       = this;
	
	var opt        = action.options;
	let optX       = opt.X
	let optY       = ((opt.Y === undefined) ? 0 : opt.Y);
	let optVal     = ''
	let scpCommand = scpCommands.find(cmd => cmd.Index == action.action); // Find which command
	
	if(scpCommand == undefined) return;
	let cmdName = scpCommand.Address;
	
	switch(scpCommand.Type){
		case 'integer':
			cmdName = `set ${cmdName}`
			optX--; 				// ch #'s are 1 higher than the parameter
			optVal = 0 + opt.Val; 	// Changes true/false to 1 0

			break;
		
		case 'string':
			cmdName = `set ${cmdName}`
			optX--; 				// ch #'s are 1 higher than the parameter except with Custom Banks
			if(scpCommand.Address.split(':')[0] !== 'MIXER') optY--;	// Custom Bank Faders (CL:Current or QL:Current commands) are 0-based
			optVal = `"${opt.Val}"` // quotes around the string
			break;

		case 'scene':
			optY = '';
			optVal = '';
			if(self.config.model == 'CL/QL'){
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
	let scpCommand = scpCommands.find(cmd => cmd.Index == feedback.type);
	
	if((scpVal != undefined) && (scpCommand != undefined)){
		let Valopt = ((scpCommand.Type == 'integer') ? 0 + options.Val : `${options.Val}`) // 0 + value turns true/false into 1 0
		let ofs = ((scpCommand.Type == 'scene') ? 0 : 1); 								// Scenes are equal, channels are 1 higher
		
		if(bankState[feedback.type] == undefined) bankState[feedback.type] = {color: bank.color, bgcolor: bank.bgcolor}
		if(options.X == parseInt(scpVal.X) + ofs)
			if((options.Y == undefined) || (options.Y == scpVal.Y))
				if((scpVal.Val == undefined) || (Valopt == scpVal.Val)){
					bankState[feedback.type] = {color: options.fg, bgcolor: options.bg};
		}
	} 
	
	return bankState[feedback.type]; // no match
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;