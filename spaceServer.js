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
var taskSolutions = {
	'TaskLifesupport': [43, 43, 43, 43]
};
// state delay - wait until calling on another state, in milliseconds
var stateDelay = {
	'TaskSchematicsRendering': 5000//180000	// 3 minutes
}
//these represent different 'pages' that have registered;
//effectively 'users' are 'pages'
//this is based on some example chat client out on the interweb...
// known page ids: 'ipadShields', 'appConsole'
var teamName = null;
var gamelog = null;
var status = "Not playing";

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
	io.sockets.emit('new message', { username: teamName, message: { event: 'game', command: 'ready' } });
}

function handleDisconnect(socket, data)
{
  console.log('disconnection');
}

function handleMessage(socket, data)
{
	gamelog.log("debug: "+JSON.stringify(data));
	console.log('new message', data);

	if (!data.event) return;
	if (data.event == "game")
	{
		if (!data.command) return;
		else if (data.command == "start") handleGameStart(socket, data);
		else if (data.command == "stop") handleGameStop(socket, data);
	}
	else if (data.event == "task")
	{
		if (!data.command) return;
		else if (data.command == "start") handleTaskStart(socket, data);
		else if (data.command == "check") handleTaskCheck(socket, data);
		else if (data.command == "stop") handleTaskStop(socket, data);
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
	gamelog.log("Task started");
}

function handleTaskCheck(socket, data)
{
	if (data.data && data.data.result && data.data.taskname)
	{
		switch (data.data.taskname)
		{
			case 'TaskLifesupport':
				var res = false;
				if (data.data.result[0] == taskSolutions[data.data.taskname][0] &&
					data.data.result[1] == taskSolutions[data.data.taskname][1] &&
					data.data.result[2] == taskSolutions[data.data.taskname][2] &&
					data.data.result[3] == taskSolutions[data.data.taskname][3])
				{
					gamelog.log("TaskLifesupport success");
					res = true;
				}
				else
				{
					gamelog.log("TaskLifesupport incorrect");
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
		}
	}
}

function handleTaskStop(socket, data)
{
	if (data.data && data.data.taskname)
	{
		switch (data.data.taskname)
		{
			case 'TaskSchematicsRendering':
				gamelog.log("TaskSchematicsRendering stop");
				console.log('TaskSchematicsRendering setting Timeout');
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
		}
	}
}

//////////////
// MAIN
var app = express();
app.use(express.static(__dirname + '/public'));

var port = process.env.PORT || 3000;
var server = http.createServer(app);
server.listen(port, function () { console.log('Server listening at port %d', port); });

var io = socketIO(server);
io.on('connection', handleConnect);
