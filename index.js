var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var session = require('express-session');

const Room = require('./js/room');
const Message = require('./js/message');
const Game = require('./js/game');

const { info } = require('console');
const url = 'localhost:69/'; //big dreams of a .com one day
const port = 69; // port for hosting site on local system. will probably be invalidated once hosted elsewhere.

var rooms = {}; // Contains all active rooms as roomid:Room
var public_rooms = {}; // Contains all public, unstarted rooms as roomname:roomid

// ==========================
// ===== EXPRESS EVENTS =====
// ==========================
app.use('/styles', express.static(__dirname + '/styles')); // Provide client with (static) stylesheets
// app.use('/scripts', express.static(__dirname + '/scripts')); //provide client with (static) scripts

// Intermediary session definition to allow socketio to handle express sessions
sessionDef = session({
	secret: 'secret-key', //apparently this should be some actual secret string. not sure why but eventually we can make it something random.
	saveUninitialized: true,
	resave: true,
});

// Initialize express session
app.use(sessionDef);

// Landing on the homepage
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

// Entering a game room
app.get('/game*', (req, res) => {
	// note: in this context, req.session refers to same object as socket.request.session in socket context. unsure if by value or reference
	if (Object.keys(rooms).includes(req.path.substr(1))) {
		console.log('user accessing game page via: ' + req.path);
		res.sendFile(__dirname + '/game.html');
	} else {
		res.send(
			'<h1>Sorry, that is an invalid game session.</h1><h2><a href="http://' +
				url +
				'">Return to homepage</a></h2>'
		);
	}
});

// =========================
// ===== SOCKET EVENTS =====
// =========================
var homesocket = io.of('/home'); // Clientside: socket = io('/home');
var gamesocket = io.of('/game'); // This namespace is for all game rooms. each will have its own socket room and role rooms.

// Putting the express session into socket context
io.use(function(socket, next) {
	sessionDef(socket.request, socket.request.res || {}, next);
});

homesocket.on('connection', socket => {
	//what to do upon a new user appearing
	console.log('a user connected to homepage');

	// Note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
	let SESSION_ID = socket.request.session.id;

	// Give user list of open public games
	socket.emit('populate rooms', Object.keys(public_rooms));

	socket.on('room create', (room_info, errorback) => {
		// Names have to be unique and at least one character. arbitrary max of 32
		let [roomName, isPublic, username] = room_info;

		// Validating Room
		if (!(roomName.length > 0 && roomName.length < 33)) {
			errorback('Room names must be 1-32 characters.');
		} else if (Object.keys(public_rooms).includes(roomName)) {
			errorback('Room with this name already exists.');
		} else {
			//name is valid; make the room.
			room = new Room(roomName, isPublic, socket.request.session.id);
			console.log('new room created with code ' + room.code);
			room.chatHistory.push(new Message(username + ' created the room.'));
			room.chatHistory.push(new Message('Invite Link: ' + url + room.code));
			rooms[room.code] = room; // Add room to catalog of all rooms

			if (isPublic) {
				public_rooms[roomName] = room.code;
			}

			// Add inital user to room
			rooms[room.code].addPlayer(socket.id, socket.request.session.id, username);

			// Tell the client a new room has been created and give them the URL to it
			socket.emit('send to room', room.code);
		}
	});

	socket.on('join via name', (info, errorback) => {
		let [roomName, username] = info;
		if (!Object.keys(public_rooms).includes(roomName)) {
			errorback('Error joining session. Please refresh and try again.');
		} else if (rooms[public_rooms[roomName]].getMemberList().includes(username)) {
			errorback('That username is already in use in this lobby.');
		} else {
			//name and session are valid; join the room
			rooms[public_rooms[roomName]].addPlayer(socket.id, SESSION_ID, username);
			socket.emit('send to room', rooms[public_rooms[roomName]].code);
		}
	});

	socket.on('join via code', (info, errorback) => {
		// BUG ALERT - Defining roomCode in the local scope. Probably will cause errors
		let [input, username] = info;
		if (input.length == 4) {
			let roomCode = 'game' + input.toUpperCase();
		} else if (input.length == 8) {
			let roomCode = input.toUpperCase();
		} else {
			errorback('Invalid room code.');
		}
		// If it goes in the else statement, then roomCode will not exist
		if (rooms[roomCode]) {
			if (rooms[roomCode].getMemberList().includes(username)) {
				errorback('That username is already in use in that lobby.');
			} else {
				//name and session are valid; join the room
				rooms[roomCode].addPlayer(socket.id, SESSION_ID, username);
				socket.emit('send to room', roomCode);
			}
		} else {
			errorback('No room exists with that code.');
		}
	});
});

gamesocket.on('connection', socket => {
	// Parse, from the client url attempt, which room is being joined
	let roomToJoin = socket.handshake.headers.referer
		.toString()
		.split('/')
		.pop()
		.substr(0, 8);
	console.log('a user connected to game page: ' + roomToJoin);
	// Note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
	let SESSION_ID = socket.request.session.id;

	// Check if the room still exists
	if (Object.keys(rooms).includes(roomToJoin)) {
		//if the room exists...
		//put the user in a socket room for the particular game room they're trying to enter
		socket.join(roomToJoin);
		//provide user with all needed room information
		socket.emit('room update', rooms[roomToJoin].clientPackage(SESSION_ID));
		//check if a game has begun
		if (rooms[roomToJoin].game != null) {
			// Check if the user is part of the game, in which case this is a reconnection
			if (Object.keys(rooms[roomToJoin].game.players).includes(SESSION_ID)) {
				rooms[roomToJoin].updateSocketLink(socket.id, SESSION_ID);
				// Put the user in a socket room for their particular role in the game (except villagers, who don't have private chat)
				if (rooms[roomToJoin].game.players[SESSION_ID].role != 'Villager') {
					socket.join(
						roomToJoin +
							rooms[roomToJoin].game.roleRoomCodes[rooms[roomToJoin].game.players[SESSION_ID].role]
					); //e.g. rooms for mafia in a game are id'd by gameXXXXgameXXXX where the first half is the game room and second half id's the role
				}
				//let room know about reconnection
				rooms[roomToJoin].chatHistory.push(
					new Message(rooms[roomToJoin].game.players[SESSION_ID].username + ' has reconnected.')
				);
				gamesocket.to(roomToJoin).emit('new chat', time_appended_msg); //push message to everyone else in room
			}
			// If they're not part of the game, add them as spectator
			// Currently should not be implemented because Game doesn't support spectators that well yet
		}
	} else {
		socket.disconnect();
	}

	socket.on('name set', (name, errorback) => {
		//errorback(error_message) is a callback on the clientside that will display the error message when name is invalid
		if (rooms[roomToJoin].getMemberList().includes(name)) {
			errorback('That name is already in use in this game');
		} else {
			console.log(rooms[roomToJoin].members[SESSION_ID]);
			rooms[roomToJoin].addPlayer(socket.id, SESSION_ID, name);
		}
	});

	socket.on('game start', (options, errorback) => {
		//options is {mafia:integer, sheriffs:integer, doctors:integer}
		//errorback(error_message) is a callback on the clientside that will display the error message when the game can't be started
		if (Object.keys(rooms[roomToJoin].members).length < 4) {
			errorback('There must be at least four players to start a game');
		} else if (
			parseInt(options.mafia) + parseInt(options.sheriffs) + parseInt(options.doctors) >
			Object.keys(rooms[roomToJoin].members).length
		) {
			errorback('Too many roles have been assigned');
		} else {
			//create new game
			rooms[roomToJoin].game = new Game(
				rooms[roomToJoin].members,
				options.mafia,
				options.sheriff,
				options.doctor
			);
			rooms[roomToJoin].chatHistory.push(new Message('New Game Started'));
			//start game for everyone by pushing them an update
			//at present, people who haven't set their names will not receive anything from here on out. eventually, spectatorship should be added.
			for (session_id in rooms[roomToJoin].socket_session_link) {
				gamesocket
					.to(socket_session_link[session_id])
					.emit('room update', rooms[roomToJoin].clientPackage(session_id));
			}
		}
	});

	socket.on('public message', text => {
		//ensure sender is part of the room, meaning they've assigned themselves a name
		//also ensure that message is not blank
		if (rooms[roomToJoin].members[SESSION_ID]) {
			if (text.length > 0) {
				let message = new Message(text, 'Public', rooms[roomToJoin].members[SESSION_ID].username);
				rooms[roomToJoin].chatHistory.push(message); //add the message to the room's chat history
				console.log('message in room ' + roomToJoin + ':' + text); //print the chat message event
				gamesocket.in(roomToJoin).emit('new chat', message); //send message to everyone in room
			}
		} else {
			console.log('illegal public message attempt from ' + socket.id + ' in room ' + roomToJoin);
		}
	});

	socket.on('private message', msg => {
		// ensure (1) game is in session (2) message is not blank (3) sender is eligible to send private msgs
		if (rooms[roomToJoin].game != null) {
			if (msg.length > 0) {
				let sender_role = rooms[roomToJoin].game.players[SESSION_ID].role;
				let sender_name = rooms[roomToJoin].game.players[SESSION_ID].username;
				// console.log('private message to all' + sender_role + ' in room ' + roomToJoin + ':' + msg); //print the chat message event
				if (sender_role != 'Villager') {
					// everyone except villagers can send chats to everyone of their own role. even spectators can talk to each other privately.
					let message = rooms[roomToJoin].sendPrivateMessage(sender_role, sender_name, msg, 'Private');
					gamesocket
						.in(roomToJoin + rooms[roomToJoin].game.roleRoomCodes[sender_role])
						.emit('new private chat', message);
				} else {
					console.log(
						'illegal private message attempt from villager ' + sender_name + ' in room ' + roomToJoin
					);
				}
			}
		} else {
			console.log('illegal private message submission attempt from ' + socket.id);
		}
	});

	socket.on('disconnect', () => {
		if (Object.keys(rooms).includes(roomToJoin)) {
			// if still in pregame stage, remove player from room membership
			if (rooms[roomToJoin].game == null) {
				rooms[roomToJoin].removePlayer(socket.id, SESSION_ID);
			}
			// if the game is ongoing and the disconnecting client was part of it, warn the room of this disconnect
			else if (rooms[roomToJoin].game.players[SESSION_ID]) {
				let msg = new Message(rooms[roomToJoin].game.players[SESSION_ID].username + ' has disconnected.');
				rooms[roomToJoin].chatHistory.push(msg);
				gamesocket.in(roomToJoin).emit('new chat', msg);
			}
		}
		console.log('user disconnected from gamepage w socket id:' + socket.id);
	});
});

http.listen(port, () => {
	console.log('listening on *:' + port);
});
