/**
 * Created by jeffdaze on 2016-09-10.
 */


//includes...
var express = require('express');
var fs = require('fs');
var http = require('http');
var socketIO = require('socket.io');

/////////////
// GAME LOGGING
var logpath = ".";

var GameLog = function(name)
{
	this.name = name;
	this.start = Date.now() / 1000 | 0;
	this.filename = logpath + "/gamelog." + name +this.start + ".txt";
}

GameLog.prototype.log = function(message)
{
	var now = (Date.now() / 1000 |0) - this.start;
	var min = now / 60 |0;
	var sec = now - (min * 60);
	var pad = (sec < 10) ? "0" : "";
	fs.appendFileSync(this.filename, min + ":" + pad + sec + " " + message+"\r\n");
	console.log(message);
}

///////////////////
// CONFIG
// task solutions
var taskSolutions = {};
var stateDelay = {};

var teamName = null;
var gamelog = null;
var status = "Not playing";
var dev = false;

// time shield was pressed
var shieldsPressStartTime = 0;
// if the shield task is enabled
var shieldsActive = false;
// timeout to clear for shields
var shieldsTimeout = null;
var shieldsClearCnt;
var shieldsClearCntMax = 4;

//////////////
// 
function handleConnect(socket)
{
	console.log("connection");
	setInterval(function () { doStatus(socket);	}, 1000);
	socket.on('new message', function (data) { handleMessage(socket, data); });
	socket.on('user register', function (data) {handleUser(socket, data); });
	socket.on('disconnect', function (data) { handleDisconnect(socket, data); });
}

function doStatus(socket)
{
	var data = {};
	if (teamName) data.team = teamName;
	data.status = status;
	data.devmode = dev;
	socket.broadcast.emit('status', data);
}

function handleUser(socket, data)
{
	if (teamName) return;

	// we store the username in the socket session for this client
	teamName = data.username;

	console.log('user register', teamName);
	gamelog = new GameLog(teamName);
	gamelog.log("Ready for Game");
	status = "Ready to play";
	shieldsPressStartTime = 0;
	shieldsActive = false;
	shieldsClearCnt = 0;
	shieldsTimeout = null;
	io.sockets.emit('new message', { username: teamName, message: { event: 'game', command: 'ready' } });
}

function handleDisconnect(socket, data)
{
	console.log('disconnection');
}

function handleGameDev(socket, data)
{
	dev = true;
	taskSolutions = {
		'TaskLifesupport': [43, 43, 43, 43],
		'TaskCommunicationsUnreachable': ['fa-star', 'fa-star', 'fa-star', 'fa-star'],
		'TaskAibadPigpen': ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G']
	};
	stateDelay = {
		'TaskSchematicsRendering': 5000,
		'TaskShield': 15000
	}
	if (teamName) io.sockets.emit('new message', { username: teamName, message: { event: 'game', command: 'dev' } });
}

function handleGameNormal(socket, data)
{
	dev = false;
	taskSolutions = {
		'TaskLifesupport': [12, 76, 27, 53],
		'TaskCommunicationsUnreachable': ['fa-asterisk', 'fa-paper-plane', 'fa-plus-square', 'fa-magnet'],
		'TaskAibadPigpen': ['E', 'L', 'E', 'M', 'E', 'N', 'T', 'P', 'R', 'O', 'D', 'U', 'C', 'T']
	};
	stateDelay = {
		'TaskSchematicsRendering': 180000,	// 3 minutes
		'TaskShield': 60000	// 1 minutes
	}
	if (teamName) io.sockets.emit('new message', { username: teamName, message: { event: 'game', command: 'normal' } });
}

function handleMessage(socket, data)
{
	if (!teamName) return;
	gamelog.log("debug: "+JSON.stringify(data));
	console.log('new message', data);

	if (!data.event) return;
	if (data.event == "game")
	{
		if (!data.command) return;
		else if (data.command == "start") handleGameStart(socket, data);
		else if (data.command == "stop") handleGameStop(socket, data);
		else if (data.command == "dev") handleGameDev(socket, data);
		else if (data.command == "normal") handleGameNormal(socket, data);
	}
	else if (data.event == "task")
	{
		if (!data.command) return;
		else if (data.command == "start") handleTaskStart(socket, data);
		else if (data.command == "check") handleTaskCheck(socket, data);
		else if (data.command == "result") handleTaskResult(socket, data);
		else if (data.command == "stop") handleTaskStop(socket, data);
	}
	else if (data.event == "state")
	{
		// just re-broadcast state events - from admin ui
		io.sockets.emit('new message', {
			username: teamName,
			message: {
				event: data.event,
				command: data.command,
				data: data.data
			}
		});

	}
}

function handleGameStart(socket, data)
{
	gamelog.log("Game started");
	io.sockets.emit('new message', { username: teamName, message: { event: 'timer', command: 'start' } });
	status = "Playing";
}

function handleGameStop(socket, data)
{
	gamelog.log("Game over");
	teamName = null;
	status = "Not Ready"
	io.sockets.emit('new message', { username: teamName, message: { event: 'game', command: 'stop' } });
}

function handleTaskStart(socket, data)
{
	if (data.data && data.data.taskname)
	{
		switch (data.data.taskname)
		{
			case 'TaskShieldsManual':
				// app task started - tell the ipad to start
				gamelog.log("TaskShieldsManual start");
				shieldsActive = true;
				io.sockets.emit('new message', {
					username: teamName,
					message: {
						event: 'state',
						command: 'set',
						data: {
							group: 'ipadshields',
							state: 'manual'
						}
					}
				});
				io.sockets.emit('new message', {
					username: teamName,
					message: {
						event: 'state',
						command: 'interrupt',
						data: {
							group: 'ipadshields'
						}
					}
				});
				break;
		}
	}
}

function checkShieldResult()
{
	var d = Date.now();
	gamelog.log("TaskIpadshieldsManual checking shields result, time:" + (d - shieldsPressStartTime));
//	if (d - shieldsPressStartTime >= (stateDelay.TaskShield - 2000)
//	{
		gamelog.log("TaskIpadshieldsManual shield times up");
		sendShieldResult(true);
//	}
}

function sendShieldResult(res)
{
	io.sockets.emit('new message', {
		username: teamName,
		message: {
			event: 'task',
			command: 'result',
			data: {
				taskname: 'TaskShieldsManual',
				result: res
			}
		}
	});
	io.sockets.emit('new message', {
		username: teamName,
		message: {
			event: 'task',
			command: 'result',
			data: {
				taskname: 'TaskIpadshieldsManual',
				result: res
			}
		}
	});
}

function handleTaskCheck(socket, data)
{
	if (data.data && data.data.result && data.data.taskname)
	{
		switch (data.data.taskname)
		{
			case 'TaskLifesupport':
			case 'TaskCommunicationsUnreachable':
			case 'TaskAibadPigpen':
				var res = false;
				var rescnt = taskSolutions[data.data.taskname].length;
				// check each result
				if (data.data.result.length == rescnt) {
					var bad = false;
					for (var i = 0 ; i < rescnt; i++) {
						if (data.data.result[i] != taskSolutions[data.data.taskname][i]) {
							bad = true;
							break;
						}
					}
					if (!bad) {
						res = true;
						gamelog.log(data.data.taskname + " success");
					}
				}
				if (!res) {
					gamelog.log(data.data.taskname + " incorrect");
				}
				console.log(data.data.taskname + ' res:', res);
				// doesn't work
				//socket.broadcast.emit('new message', {
				io.sockets.emit('new message', {
					username: teamName,
					message: {
						event: data.event,
						command: 'result',
						data: {
							taskname: data.data.taskname,
							result: res
						}
					}
				});
				break;
			case 'TaskIpadshieldsManual':
				gamelog.log("TaskIpadshieldsManual check");
				if (!shieldsActive) break;
				if (data.data.result == "press")
				{
					gamelog.log("TaskIpadshieldsManual press " + shieldsTimeout);
					if (!shieldsTimeout)
					{
						gamelog.log("TaskIpadshieldsManual press set timeout " + shieldsTimeout);
						shieldsTimeout = setTimeout(function () { checkShieldResult(); }, stateDelay.TaskShield);
						shieldsPressStartTime = Date.now();
					}
				}
				else // release
				{
					// if we released the button and the timeout didn't end
					// it wasn't long enough
					gamelog.log("TaskIpadshieldsManual release");
					if (shieldsClearCnt < shieldsClearCntMax)
					{
						gamelog.log("TaskIpadshieldsManual release count " + shieldsClearCnt);
						clearTimeout(shieldsTimeout);
						shieldsTimeout = null;
						shieldsPressStartTime = 0;
						shieldsClearCnt++;
					}
				}

				// notify all clients of this shield setting: press/release
				io.sockets.emit('new message', {
					username: teamName,
					message: {
						event: data.event,
						command: data.command,
						data: {
							taskname: data.data.taskname,
							result: data.data.result
						}
					}
				});
				break;
		}
	}
}

function handleTaskResult(socket, data)
{
	// just re-broadcast task result events - from admin ui
	io.sockets.emit('new message', {
		username: teamName,
		message: {
			event: data.event,
			command: data.command,
			data: data.data
		}
	});
}

function handleTaskStop(socket, data)
{
	if (data.data && data.data.taskname)
	{
		switch (data.data.taskname)
		{
			case 'TaskSchematicsRendering':
				gamelog.log("TaskSchematicsRendering stop");
				setTimeout(function() {
					console.log('Timeout done TaskSchematicsRendering');
					gamelog.log("TaskLifesupport set");
					io.sockets.emit('new message', {
						username: teamName,
						message: {
							event: 'state',
							command: 'set',
							data: {
								group: 'lifesupport',
								state: 'failure'
							}
						}
					});
					io.sockets.emit('new message', {
						username: teamName,
						message: {
							event: 'state',
							command: 'interrupt',
							data: {
								group: 'lifesupport'
							}
						}
					});
				}, stateDelay.TaskSchematicsRendering);
				break;
			case 'TaskShieldsManual':
				// app task stopped - tell the ipad to stop
				gamelog.log("TaskShieldsManual stop");
				shieldsActive = false;
				break;
		}
	}
}

//////////////
// MAIN
handleGameNormal();

var app = express();
app.use(express.static(__dirname + '/public'));

var port = process.env.PORT || 3000;
var server = http.createServer(app);
server.listen(port, function () { console.log('Server listening at port %d', port); });

var io = socketIO(server);
io.on('connection', handleConnect);
