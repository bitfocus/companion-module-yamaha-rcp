// Control module for Yamaha Pro Audio
// Jack Longden <Jack@atov.co.uk> 2019
var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;
var line      = '';
var productnm = '';
var inputch   = 0;
var auxbus    = 0;
var mixbus    = 0;
var matrixbus = 0;

// Instance Setup & Connect
function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	// export actions
	self.actions();

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;

	self.init_tcp();
}

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.status(1,'Connecting'); // status ok!

	self.init_tcp();
}

// Initialise TCP and if good, query device info
instance.prototype.init_tcp = function() {
	var self = this;
	var receivebuffer = '';
	var linestring = '';

	function getproductnm(){
		self.socket.send('devinfo productname' + "\n");
	}

	function getinputch(){
		self.socket.send('devinfo inputch' + "\n");
	}

	function getauxbus(){
		self.socket.send('devinfo auxbus' + "\n");
	}

	function getmixbus(){
		self.socket.send('devinfo mixbus' + "\n");
	}

	function getmatixbus(){
		self.socket.send('devinfo matrixbus' + "\n");
	}

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
			debug("Network error", err);
			self.status(self.STATE_ERROR, err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			self.status(self.STATE_OK);
			debug("Connected");
			self.log('',"Connected");
			getproductnm();
			setTimeout(getinputch,  500 );
			setTimeout(getauxbus,   1000);
			setTimeout(getmixbus,   1500);
			setTimeout(getmatixbus, 2000);
		});

		self.socket.on('data', function (chunk) {
			receivebuffer += chunk;
			line = receivebuffer.substr(0, receivebuffer.length);

			if (receivebuffer.indexOf('NOTIFY') == '-1'){
				debug("Recieved from device: "+ line.toString());
			}

			if (receivebuffer.indexOf('productname') != '-1'){
				if (receivebuffer.indexOf('CL') != '-1'){
					productnm = 'CL/QL';
				}
				else if (receivebuffer.indexOf('QL') != '-1') {
					productnm = 'CL/QL'
				}
				else if (receivebuffer.indexOf('TF') != '-1') {
					productnm = 'TF'
				}
				self.log('',"Type: " + productnm);
				receivebuffer = '';
				self.actions();
			}

			if (receivebuffer.indexOf('inputch') != '-1'){
				linestring = line.toString();
				inputch = linestring.match(/\d+/g).map(Number);;
				receivebuffer = '';
				self.log('',"Input Count: " + inputch);
				self.actions();
			}

			if (receivebuffer.indexOf('auxbus') != '-1'){
				linestring = line.toString();
				auxbus = linestring.match(/\d+/g).map(Number);;
				receivebuffer = '';
				self.log('',"Aux Bus Count: " + auxbus);
				self.actions();
			}

			if (receivebuffer.indexOf('mixbus') != '-1'){
				linestring = line.toString();
				mixbus = linestring.match(/\d+/g).map(Number);;
				receivebuffer = '';
				if (mixbus > '0'){
					self.log('',"Mix Bus Count: " + mixbus);
				}
				self.actions();
			}

			if (receivebuffer.indexOf('matrixbus') != '-1'){
				linestring = line.toString();
				matrixbus = linestring.match(/\d+/g).map(Number);;
				receivebuffer = '';
				self.log('',"Matrix Bus Count: " + matrixbus);
				self.actions();
			}

			receivebuffer = '';
		});
	}
}

// Web config fields
instance.prototype.config_fields = function () {
	var self = this;

	return [{
			type: 'textinput',
			id: 'host',
			label: 'IP Address of Console',
			width: 6,
			default: '192.168.0.100',
			regex: self.REGEX_IP
		}]
}

// Module deletion
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);;
}

// Module actions
instance.prototype.actions = function(system) {
	var self = this;
	var inputchopt   = [];
	var auxbusopt    = [];
	var mixbusopt    = [];
	var matrixbusopt = [];

	if(inputch>0){
		for (var i = 0; i < inputch; i++){
			inputchopt.push({ id: i,  label: i+1 });
		}
	}

	if(auxbus>0){
		for (var i = 0; i < auxbus; i++){
			auxbusopt.push({ id: i,  label: i+1 });
		}
	}

	if(mixbus>0){
		for (var i = 0; i < mixbus; i++){
			mixbusopt.push({ id: i,  label: i+1 })
		}
	}

	if(matrixbus>0){
		for (var i = 0; i < matrixbus; i++){
			matrixbusopt.push({ id: i,  label: i+1 })
		}
	}

	if(productnm = 'TF'){

		var commands = {
			'InChOn': {
				label: 'Input On',
				options: [{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt }]
			},
			'InChOff': {
				label: 'Input Off',
				options: [{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt }]
			},
			'InChLevel': {
				label: 'Input Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt},
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'AuxOn': {
				label: 'Aux On',
				options: [{type: 'dropdown', label: 'Aux', id: 'Ch', default: '0', choices: auxbusopt}]
			},
			'AuxOff': {
				label: 'Aux Off',
				options: [{ type: 'dropdown', label: 'Aux', id: 'Ch', default: '0', choices: auxbusopt }]
			},
			'AuxLevel': {
				label: 'Aux Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Aux', id: 'Ch', default: '0', choices: auxbusopt },
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'MtrxOn': {
				label: 'Matrix On',
				options: [{type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt }]
			},
			'MtrxOff': {
				label: 'Matrix Off',
				options: [{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt }]
			},
			'MtrxLevel': {
				label: 'Matrix Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt },
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'TFRecall': {
				label: 'Recall Scene',
				options: [
					{ type: 'dropdown', label: 'Bank', id: 'Bank', default: 'a', choices: [
						{ id: 'a',  label: 'A'  },
						{ id: 'b',  label: 'B'  }]
					},
					{ type: 'dropdown', label: 'Preset', id: 'Scene', default: '0', choices: [
						{ id: 0,  label: '00' },
						{ id: 1,  label: '01' },
						{ id: 2,  label: '02' },
						{ id: 3,  label: '03' },
						{ id: 4,  label: '04' },
						{ id: 5,  label: '05' },
						{ id: 6,  label: '06' },
						{ id: 7,  label: '07' },
						{ id: 8,  label: '08' },
						{ id: 9,  label: '09' },
						{ id: 10, label: '10' },
						{ id: 11, label: '11' },
						{ id: 12, label: '12' },
						{ id: 13, label: '13' },
						{ id: 14, label: '14' },
						{ id: 15, label: '15' },
						{ id: 16, label: '16' },
						{ id: 17, label: '17' },
						{ id: 18, label: '18' },
						{ id: 19, label: '19' },
						{ id: 20, label: '20' },
						{ id: 21, label: '21' },
						{ id: 22, label: '22' },
						{ id: 23, label: '23' },
						{ id: 24, label: '24' },
						{ id: 25, label: '25' },
						{ id: 26, label: '26' },
						{ id: 27, label: '27' },
						{ id: 28, label: '28' },
						{ id: 29, label: '29' },
						{ id: 30, label: '30' },
						{ id: 31, label: '31' },
						{ id: 32, label: '32' },
						{ id: 33, label: '33' },
						{ id: 34, label: '34' },
						{ id: 35, label: '35' },
						{ id: 36, label: '36' },
						{ id: 37, label: '37' },
						{ id: 38, label: '38' },
						{ id: 39, label: '39' },
						{ id: 40, label: '40' },
						{ id: 41, label: '41' },
						{ id: 42, label: '42' },
						{ id: 43, label: '43' },
						{ id: 44, label: '44' },
						{ id: 45, label: '45' },
						{ id: 46, label: '46' },
						{ id: 47, label: '47' },
						{ id: 48, label: '48' },
						{ id: 49, label: '49' },
						{ id: 50, label: '50' },
						{ id: 51, label: '51' },
						{ id: 52, label: '52' },
						{ id: 53, label: '53' },
						{ id: 54, label: '54' },
						{ id: 55, label: '55' },
						{ id: 56, label: '56' },
						{ id: 57, label: '57' },
						{ id: 58, label: '58' },
						{ id: 59, label: '59' },
						{ id: 60, label: '60' },
						{ id: 61, label: '61' },
						{ id: 62, label: '62' },
						{ id: 63, label: '63' },
						{ id: 64, label: '64' },
						{ id: 65, label: '65' },
						{ id: 66, label: '66' },
						{ id: 67, label: '67' },
						{ id: 68, label: '68' },
						{ id: 69, label: '69' },
						{ id: 70, label: '70' },
						{ id: 71, label: '71' },
						{ id: 72, label: '72' },
						{ id: 73, label: '73' },
						{ id: 74, label: '74' },
						{ id: 75, label: '75' },
						{ id: 76, label: '76' },
						{ id: 77, label: '77' },
						{ id: 78, label: '78' },
						{ id: 79, label: '79' },
						{ id: 80, label: '80' },
						{ id: 81, label: '81' },
						{ id: 82, label: '82' },
						{ id: 83, label: '83' },
						{ id: 84, label: '84' },
						{ id: 85, label: '85' },
						{ id: 86, label: '86' },
						{ id: 87, label: '87' },
						{ id: 88, label: '88' },
						{ id: 89, label: '89' },
						{ id: 90, label: '90' },
						{ id: 91, label: '91' },
						{ id: 92, label: '92' },
						{ id: 93, label: '93' },
						{ id: 94, label: '94' },
						{ id: 95, label: '95' },
						{ id: 96, label: '96' },
						{ id: 97, label: '97' },
						{ id: 98, label: '98' },
						{ id: 99, label: '99' }]
					}
				]
			}
		};
	}

	else if(productnm = 'CL/QL'){
		var commands = {

			'InChOn': {
				label: 'Input On',
				options: [{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt }]
			},
			'InChOff': {
				label: 'Input Off',
				options: [{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt }]
			},
			'InChLevel': {
				label: 'Input Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Input', id: 'Ch', default: '0', choices: inputchopt },
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'MixOn': {
				label: 'Mix On',
				options: [{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: mixbusopt }]
			},
			'MixOff': {
				label: 'Mix Off',
				options: [{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: mixbusopt }]
			},
			'MixLevel': {
				label: 'Mix Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: mixbusopt },
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'MtrxOn': {
				label: 'Matrix On',
				options: [{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt }]
			},
			'MtrxOff': {
				label: 'Matrix Off',
				options: [{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt }]
			},
			'MtrxLevel': {
				label: 'Matrix Level Adjust',
				options: [
					{ type: 'dropdown', label: 'Matrix', id: 'Ch', default: '0', choices: matrixbusopt },
					{ type: 'textinput',label: 'Value (-32768 to 1000)',id: 'ChAct',default: '0',regex: self.REGEX_SIGNED_NUMBER }
				]
			},

			'CLQLRecall': {
				label: 'Recall Scene',
				options: [{ type: 'textinput',label: 'Scene (0 to 300)',id: 'Scene',default: '0',regex: self.REGEX_SIGNED_NUMBER }]
			}
		};
	}

	self.system.emit('instance_actions', self.id, commands);
}

instance.prototype.action = function(action) {
	var self = this;
	var opt = action.options

	switch (action.action) {

		case 'InChOn':
			cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 1';
			break;

		case 'InChOff':
			cmd = 'set MIXER:Current/InCh/Fader/On '+ opt.Ch + ' 0 0';
			break;

		case 'InChLevel':
			cmd = 'set MIXER:Current/InCh/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
			break;

		case 'AuxOn':
			cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 1';
			break;

		case 'AuxOff':
			cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 0';
			break;

		case 'AuxLevel':
			cmd = 'set MIXER:Current/Mix/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
			break;

		case 'MixOn':
			cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 1';
			break;

		case 'MixOff':
			cmd = 'set MIXER:Current/Mix/Fader/On '+ opt.Ch + ' 0 0';
			break;

		case 'MixLevel':
			cmd = 'set MIXER:Current/Mix/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
			break;

		case 'MtrxOn':
			cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 1';
			break;

		case 'MtrxOff':
			cmd = 'set MIXER:Current/Mtrx/Fader/On '+ opt.Ch + ' 0 0';
			break;

		case 'MtrxLevel':
			cmd = 'set MIXER:Current/Mtrx/Fader/Level ' + opt.Ch + ' 0 ' + opt.ChAct;
			break;

		case 'TFRecall':
			cmd = 'ssrecall_ex scene_'+ opt.Bank + ' ' + opt.Scene;
			break;

		case 'CLQLRecall':
			cmd = 'ssrecall_ex MIXER:Lib/Scene ' + opt.Scene;
			break;
	}

	if (cmd !== undefined) {

		debug('sending ',cmd,"to",self.config.host);

		if (self.socket !== undefined && self.socket.connected) {
			self.socket.send(cmd + "\n");
		}
		else {
			debug('Socket not connected :(');
		}
	}
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
