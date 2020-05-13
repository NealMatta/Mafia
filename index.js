var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var session = require('express-session')

const url = 'localhost:69/' //big dreams of a .com one day
const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

//// Database ////

var rooms = {}; //contains all active rooms as roomid:Room
var public_rooms = {}; //contains all public, unstarted rooms as roomname:roomid

//// Helper Functions & Classes ////

function currentTime() {
	//returns current time in "[HH:MM:SS] " 24hr format (string)
	var d = new Date();
	return "[" + d.toTimeString().substr(0, 8) + "] ";
}

function generateRoomCode() {
  return 'game'+Math.random().toString(36).substring(2, 15);
}

function verifyRequest(player, room) {
	return 1;
}

class Room {
  constructor(name, isPublic) {
	this.code = generateRoomCode();
	this.chatHistory = []; //string array of all chats
	this.name = name; //custom room name
	this.isPublic = isPublic; //whether this room should be advertised on homepage
  }
  //a singular object to send the client, containing no private info (ex. who the mafia are)
  clientPackage() {
	  let to_return = {
		  roomname: this.name,
		  roomcode: this.code,
		  chatHistory: this.chatHistory
	  };
	  return to_return;
  }
}

//// Express Events ////

app.use("/styles", express.static(__dirname + "/styles")); //provide client with (static) stylesheets

//intermediary session definition to allow socketio to handle express sessions
sessionDef = session({
	secret: 'secret-key',
	saveUninitialized: true,
	resave: true
});

//initialize express session
app.use(sessionDef);

//landing on the homepage
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/index.html");
});

//entering a game room
app.get("/game*", (req, res) => {
	if (Object.keys(rooms).includes(req.path.substr(1))) {
		req.session.socketRoomToJoin = req.path.substr(1);
		console.log('user accessing game page.');
		res.sendFile(__dirname + "/game.html");
	}
	else {
		res.send('<h1>Sorry, that is an invalid game session.</h1>');
	}
});

//// Socket Events ////

var homesocket = io.of('/home'); //clientside: socket = io('/home');
var gamesocket = io.of('/game'); //this namespace is for all game rooms. each will have its own socket room and role rooms.

//putting the express session into socket context
io.use(function(socket, next) {
	sessionDef(socket.request, socket.request.res || {}, next)
})

homesocket.on("connection", socket => {
	//what to do upon a new user appearing
	console.log('a user connected to homepage');
	// console.log('session id: ' + socket.request.session.id); //unique user identifier

	//give user list of open public games
	socket.emit('populate rooms', Object.keys(public_rooms));

	socket.on('room create', (room_info) => {
		// names have to be unique and at least one character. arbitrary max of 32
		name = room_info[0]; //eventually should sanitization
		isPublic = room_info[1];
		console.log('length of name: ' + name.length)
		if (!(name.length > 0 && name.length < 33)) {
			socket.emit('warning', 'Room names must be 1-32 characters.');
		}
		else if (Object.keys(public_rooms).includes(name)) {
			socket.emit('warning', 'Room with this name already exists.');
		}
		else {
			room = new Room(name, isPublic);
			room.chatHistory.push('INVITE LINK: ' + url+room.code)
			rooms[room.code] = room; //add this room to the catalog of all rooms
			if (isPublic) {
				public_rooms[name] = room.code;
			}
			console.log('a new room has been created: ' + [name, isPublic])
			
			socket.emit('room created', room.code); //tell the client a new room has been created and give them the URL to it
		}
    });
})

gamesocket.on("connection", socket => {
	console.log('a user connected to game page');

	//check if the room still exists
	if (Object.keys(rooms).includes(socket.request.session.socketRoomToJoin)) {
		//put the user in a socket room for the particular game room they're trying to enter
		socket.join(socket.request.session.socketRoomToJoin);
		//provide user with (public) room information
		socket.emit("room update", rooms[socket.request.session.socketRoomToJoin].clientPackage());
	}

	socket.on("chat message", msg => {
		console.log(msg);
		roomcode = msg[0];
		text = msg[1];
		var time_appended_msg = currentTime() + text; //format the message
		rooms[roomcode].chatHistory.push(time_appended_msg); //add the message to the room's chat history
		console.log("message in room " + roomcode + ":" + time_appended_msg); //print the chat message event
		gamesocket.emit("new chat", time_appended_msg); //send message to everyone on a game page
	});

	socket.on("disconnect", () => {
		//what to do upon new user disappearing
		//TODO: announce to gamelog who has disconnected
		console.log("user disconnected");
	});

});

http.listen(port, () => {
	console.log("listening on *:" + port);
});
