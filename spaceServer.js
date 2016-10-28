/**
 * Created by jeffdaze on 2016-09-10.
 */


//includes...
var express = require('express');
var fs = require('fs');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

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

server.listen(port, function () {
	console.log('Server listening at port %d', port);
});

//set up public path (this is super standard for express)
app.use(express.static(__dirname + '/public'));

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
var numUsers = 0;
var addedUser = false;
var gamelog = null;

io.on('connection', function (socket) {
	//create a timer -- maybe transmit a pulse every 30 seconds?
	setInterval(function(){
		var now = Date.now();

		socket.broadcast.emit('timePulse', {
			timeTick: now
		});
	}, 30000);


	// when the client emits 'new message', this listens and executes
	socket.on('new message', function (data) {

		gamelog.log("debug: "+JSON.stringify(data));
		console.log('new message', data);

		if (data.event)
		{
			switch (data.event)
			{
				case 'game':
					if (data.command)
					{
						switch (data.command)
						{
							case 'start':
								gamelog.log("Game started");
								io.sockets.emit('new message', {
									username: socket.username,
									message: {
										event: 'timer',
										command: 'start'
									}
								});
								break;
							case 'stop':
								gamelog.log("Game over");
								addedUser = false;
								break;
						}
					}

					break;
				case 'task':
					if (data.command)
					{
						switch (data.command)
						{
							case 'start':
								gamelog.log("Task started");
								break;
							case 'check':
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
												username: socket.username,
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
								break;
							case 'stop':
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
													username: socket.username,
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
													username: socket.username,
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
								break;
						}
					}
					break;
			}
		}
	});

	// when the client emits 'user register', this listens and executes
	socket.on('user register', function (data) {
		if (addedUser) return;

		// we store the username in the socket session for this client
		socket.username = data.username;
		++numUsers;
		addedUser = true;

		console.log('user register', socket.username);
		gamelog = new GameLog(socket.username);
		gamelog.log("Ready for Game");

		// echo globally (all clients) that a person has connected
		socket.broadcast.emit('user joined', {
			username: socket.username,
			numUsers: numUsers
		});
	});

	// when the user disconnects, remove them and broadcast that they have left...
	socket.on('disconnect', function () {
		if (addedUser) {
			--numUsers;

			console.log('disconnect', socket.username);

			// echo globally that this client has left
			socket.broadcast.emit('user left', {
				username: socket.username,
				numUsers: numUsers
			});
		}
	});
});