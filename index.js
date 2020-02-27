// Control module for Yamaha Pro Audio, using SCP communication
// Jack Longden <Jack@atov.co.uk> 2019
// updated by Andrew Broughton <andy@checkcheckonetwo.com> Feb 2020

var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var SCPcommands = [];
var SCPVal = {};
var bankState = {};
const SCPParams = ['Ok', 'Command', 'Index', 'Address', 'X', 'Y', 'Min', 'Max', 'Default', 'Unit', 'Type', 'UI', 'RW', 'Scale'];
const SCPVals = ['Status', 'Command', 'Address', 'X', 'Y', 'Val', 'TxtVal'];


// Instance Setup & Connect
function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

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
	SCPcommands = ParseData(data, SCPParams);
	NewConsole(self);
}

// Startup
instance.prototype.init = function() {
	var self = this;

	self.updateConfig(self.config);
}

// Make each command line into an object that can be used to create the commands
function ParseData(data, params){
	var self    = this;
	let cmds    = [];
	let line    = [];
	const lines = data.toString().split("\x0A");
	
	for (let i = 0; i < lines.length; i++){
		// I'm not going to even try to explain this next line,
		// but it basically pulls out the space-separated values, except for spaces those that are inside quotes!
		line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)
		if(line !== null && (['OK','NOTIFY'].indexOf(line[0].toUpperCase()) !== -1)){
			let SCPcommand = new Object();
			
			for (var j = 0; j < line.length; j++){
				SCPcommand[params[j]] = line[j].replace(/"/g,'');  // Get rid of any double quotes around the strings
			}
			cmds.push(SCPcommand);
		}		
	}
	return cmds
}


// Whenever the console type changes, update the info
function NewConsole(self){
	self.log('info', `Device model= ${self.config.model}`);		
	
	self.init_tcp();
	self.actions(); // Re-do the actions once the console is chosen
}


// Initialise TCP and if good, query device info
instance.prototype.init_tcp = function() {
	var self          = this;
	let receivebuffer = '';
	let receivedcmd   = [];
	let cmdindex      = -1;

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
		});

		self.socket.on('data', function (chunk) {
			receivebuffer += chunk;
			
			self.log('info', `Received from device: ${receivebuffer}`);
			
			receivedcmd = ParseData(receivebuffer, SCPVals); // Break out the parameters
			for(let i=0; i < receivedcmd.length; i++){
				cmdindex = SCPcommands.find(cmd => cmd.Address == receivedcmd[i].Address).Index; // Find which command
				
				if(cmdindex != -1){
					SCPVal = receivedcmd[i];
					self.checkFeedbacks(cmdindex);
				};
			};
			
			SCPVal = {};
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
	let SCPcmd    = '';
	let ValParams = {};

	for (let i = 0; i < SCPcommands.length; i++){
		
		SCPcmd = SCPcommands[i]

		if(self.config.model == 'TF' && SCPcmd.Type == 'scene'){
			SCPLabel = 'Scene/Bank'
		}
		else{
			SCPLabel = SCPcmd.Address.slice(SCPcmd.Address.indexOf("/") + 1); // String after "MIXER:Current/"
		}
		
		// Add the commands from the data file
		commands[SCPcmd.Index] = {
			label: `${SCPcmd.Index}: ${SCPLabel}`, 
			options: [
				{type: 'number', label: SCPLabel.split("/")[0], id: 'X', min: 1, max: SCPcmd.X, default: 1, required: true, range: false}]
		}
		if(SCPcmd.Y > 1){
			if(self.config.model == "TF" && SCPcmd.Type == 'scene'){
				ValParams = {type: 'dropdown', label: SCPLabel.split("/")[1], id: 'Y', default: 'A', choices:[
					{id: 'A', label: 'A'},
					{id: 'B', label: 'B'}
				]}
			}
			else{
				ValParams = {type: 'number', label: SCPLabel.split("/")[1], id: 'Y', min: 1, max: SCPcmd.Y, default: 1, required: true, range: false}
			}
			commands[SCPcmd.Index].options.push(ValParams);
		}
		switch(SCPcmd.Type){
			case 'integer':
				if(SCPcmd.Max == 1){
					ValParams = {type: 'checkbox', label: 'On', id: 'Val', default: SCPcmd.Default}
				}
				else{
					ValParams = {
						type: 'number', label: SCPLabel.split("/")[2], id: 'Val', min: SCPcmd.Min, max: SCPcmd.Max, default: parseInt(SCPcmd.Default), required: true, range: false
					}
				}
				break;
			case 'string':
				ValParams = {type: 'textinput', label: SCPLabel.split("/")[2], id: 'Val', default: SCPcmd.Default, regex: ''}
				break;
			default:
				feedbacks[SCPcmd.Index] = JSON.parse(JSON.stringify(commands[SCPcmd.Index])); // Clone
				feedbacks[SCPcmd.Index].options.push(
					{type: 'colorpicker', label: 'Forground Colour', id: 'fg', default: this.rgb(0,0,0)},
					{type: 'colorpicker', label: 'Background Colour', id: 'bg', default: this.rgb(255,0,0)}
				)
				continue; // Don't push another parameter - In the case of a Scene message
		}
		
		commands[SCPcmd.Index].options.push(ValParams);

		feedbacks[SCPcmd.Index] = JSON.parse(JSON.stringify(commands[SCPcmd.Index])); // Clone
		feedbacks[SCPcmd.Index].options.push(
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
	let Xopt       = opt.X
	let Yopt       = ((opt.Y === undefined) ? 0 : opt.Y);
	let Valopt     = ''
	let SCPcommand = SCPcommands.find(cmd => cmd.Index == action.action); // Find which command
	
	if(SCPcommand == undefined) return;
	let cmdname = SCPcommand.Address; // Should this use a "find" to find the matching cmd.Index intead of the name?
	
	switch(SCPcommand.Type){
		case 'integer':
			cmdname = `set ${cmdname}`
			Xopt--; 				// ch #'s are 1 higher than the parameter
			Valopt = 0 + opt.Val; 	// Changes true/false to 1 0
			break;
		
		case 'string':
			cmdname = `set ${cmdname}`
			Xopt--; 				// ch #'s are 1 higher than the parameter
			Valopt = `"${opt.Val}"` // quotes around the string
			break;

		case 'scene':
			Yopt = '';
			Valopt = '';
			if(self.config.model == 'CL/QL'){
				cmdname = `ssrecall_ex ${cmdname}`  		// Recall Scene for CL/QL
			}
			else{
				cmdname = `ssrecall_ex ${cmdname}${opt.Y}` 	// Recall Scene for TF
			}
	}		
	
	cmd = `${cmdname} ${Xopt} ${Yopt} ${Valopt}`.trim(); 	// Command string to send to console
	
	if (cmd !== undefined) {
		self.log('info', `sending ${cmd} to ${self.config.host}`);

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
	let SCPcommand = SCPcommands.find(cmd => cmd.Index == feedback.type);
	
	if((SCPVal != undefined) && (SCPcommand != undefined)){
		let Valopt = ((SCPcommand.Type == 'integer') ? 0 + options.Val : `${options.Val}`) // 0 + value turns true/false into 1 0
		let ofs = ((SCPcommand.Type == 'scene') ? 0 : 1); 								// Scenes are equal, channels are 1 higher
		
		if(bankState[feedback.type] == undefined) bankState[feedback.type] = {color: bank.color, bgcolor: bank.bgcolor}
		if(options.X == parseInt(SCPVal.X) + ofs)
			if((options.Y == undefined) || (options.Y == SCPVal.Y))
				if((SCPVal.Val == undefined) || (Valopt == SCPVal.Val)){
					bankState[feedback.type] = {color: options.fg, bgcolor: options.bg};
		}
	} 
	
	return bankState[feedback.type]; // no match
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;