var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var session = require('express-session');

const url = 'localhost:69/'; //big dreams of a .com one day
const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

//// Database ////

var rooms = {}; //contains all active rooms as roomid:Room
var public_rooms = {}; //contains all public, unstarted rooms as roomname:roomid

//// Helper Functions & Classes ////

function currentTime() {
	//returns current time in "[HH:MM:SS] " 24hr format (string)
	var d = new Date();
	return '[' + d.toTimeString().substr(0, 8) + '] ';
}

function randomNumBetween(min, max) {
	//inclusive
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRoomCode() {
	return (
		'game' +
		Math.random()
			.toString(36)
            .substr(2, 4)
            .toUpperCase()
	);
}

// function generateRandCode() {
// 	return (
// 		Math.random()
// 			.toString(36)
//             .substr(2, 6)
// 	);
// }

class Room {
	constructor(name, isPublic) {
        this.code = generateRoomCode(); //a code for people to use to join the lobby
		this.chatHistory = []; //string array of all chats
		this.name = name; //custom room name
		this.isPublic = isPublic; //whether this room should be advertised on homepage
		this.gameOngoing = false; //this might end up being unnecessary, instead perhaps just checking if game==null
		this.game = null; //null until a game starts. needs to be initialized here so clientPackage() doesn't fail.
        this.members = {}; //contains players (sessionID:Player), populated when people set a username, passed to game upon game start.
                            //after game start, could include spectators?
    }
	addPlayer(id, username) {
		this.members[id] = new Player(username);
	}
	startGame(numSheriff, numDoctors, numMafia) {
		this.game = new Game(this.members, numSheriff, numDoctors, numMafia);
		this.gameOngoing = true;
	}
	//a singular object to send the client, containing pertinent info and nothing the client shouldn't have access to
	clientPackage(sessionID) {
		return {
			roomname: this.name,
			roomcode: this.code,
			chatHistory: this.chatHistory,
			gameHasBegun: this.gameOngoing, //this might end up being unnecessary, instead perhaps just checking if game==null
            game: (this.game==null) ? this.game.clientPackage(sessionID) : null
		};
	}
}

class Game {
	constructor(players, numSheriff, numDoctors, numMafia) {
		// Check for irregularities. Ex. numRoles can't be greater than # of players
		this.players = players; //object with name:value pairs sessionID:Player
		this.numSheriff = numSheriff;
		this.numDoctors = numDoctors;
        this.numMafia = numMafia;
        this.assignRoles();
        this.playerkey = players; //holds original roles, for distribution in postgame
        this.gamePhase = 'Day';
        this.roleRoomCodes = {
            'Mafia': generateRoomCode(),
            'Sheriff': generateRoomCode(),
            'Doctor': generateRoomCode(),
            'Spectator': generateRoomCode()
        }
    }
	assignRoles() {
		this.numVillagers = Object.keys(this.players).length - this.numSheriff - this.numDoctors - this.numMafia;
		let part1 = Array(this.numSheriff).fill('Sheriff');
		let part2 = Array(this.numDoctors).fill('Doctor');
		let part3 = Array(this.numMafia).fill('Mafia');
		let part4 = Array(this.numVillagers).fill('Villager');
		let roleLabels = part1.concat(part2, part3, part4);
		let players = Object.keys(this.players); //list of session IDs
		while (roleLabels.length != 0) { //perform until no more labels to give/roles to assign
			role = roleLabels[randomNumBetween(0,roleLabels.length-1)];
			player = players[randomNumBetween(0,players.length-1)];
			this.players[player].setRole(role);
			delete players[player];
			delete roleLabels[role];
		}
    }
    getPlayerList(status = 'All') {
        //return [{username: username, isDead: isDead},...]
        var to_return = [];
        if (status == 'Alive') { //if status is overrided to only request alive players
            for (sid in this.players) {
                if (!players[sid].isDead) {
                    to_return.push({username:players[sid].username, isDead:players[sid].isDead})
                }
            }
        }
        else { //if an argument is not provided (default behavior)
            for (sid in this.players) { 
                to_return.push({username:players[sid].username, isDead:players[sid].isDead})
            }
        }
        return to_return;
    }
    getPlayersWithRole(role) {
        //return list of usernames
        var to_return = [];
        for (sid in this.players) {
            if (players[sid].role == role) {
                to_return.push(players[sid].username)
            }
        }
        return to_return;
    }
    advance() { //move on to the next game phase
        this.gamePhase == 'Day' ? this.gamePhase = 'Night' : this.gamePhase = 'Day';
    }
    actions(role) { //contents of the action box for each type of player
        if (this.gamePhase == 'Day') {
            return {
                prompt: 'Select who to execute',
                choices: this.getPlayerList('Alive'),
                teammates: this.getPlayerList('Alive')
            }
        }
        else { // Night
            switch(role) {
                case 'Mafia':
                    return {
                        prompt: 'Select who to kill',
                        choices: this.getPlayerList('Alive'),
                        teammates: this.getPlayersWithRole('Mafia')
                    }
                    break;
                case 'Doctor':
                    return {
                        prompt: 'Select who to save',
                        choices: this.getPlayerList('Alive'),
                        teammates: this.getPlayersWithRole('Doctor')
                    }
                    break;
                case 'Sheriff':
                    return {
                        prompt: 'Select who to investigate',
                        choices: this.getPlayerList('Alive'), //perhaps dead or alive? possibly you can investigate dead people? maybe not good strategy but not unrealistic
                        teammates: this.getPlayersWithRole('Sheriff')
                    }
                    break;
                default: //villagers
                    return {
                        prompt: '',
                        choices: {},
                        teammates: {}
                    }
                    break;
            }
        }
    }
    sendPrivateMessage(to, from, msg) {
        //to == role; from == session ID
        let formatted_msg = currentTime() + '(' this.players[from].username + ' > ' + to + ') ' + msg;
        //example output: '[10:14:33] (Alice > Mafia) We should kill Bob'
        for (sid in players) {
            if (players[sid].role == to) {
                players[sid].gameLog.push(formatted_msg);
            }
        }
        return formatted_msg;
    }
	clientPackage(sessionID) {
        return {
            me: this.players[sessionID], //so client can can read their own gamelog, role, and status
            players: this.getPlayerList(),
            actions: this.actions(this.players[sessionID].role),
            teammates: (this.players[sessionID].role == 'Villager' || this.players[sessionID].role == 'Spectator')
                ? []
                : this.getPlayersWithRole(this.players[sessionID].role)
        };
	}
}

class Player {
	constructor(username) {
		this.username = username;
        this.isDead = false;
        this.gameLog = []; //a complete log private to this player. can contain things like... "You investigated Alice -- she is a Villager" or "You and 2 other mafia killed Bob"
	}
	kill() {
        this.isDead = true; 
        this.role = 'Spectator'
    }
    setRole(role) {
        this.role = role;
    }
}

//// Express Events ////

app.use('/styles', express.static(__dirname + '/styles')); //provide client with (static) stylesheets

//intermediary session definition to allow socketio to handle express sessions
sessionDef = session({
	secret: 'secret-key', //apparently this should be some actual secret string. not sure why but eventually we can make it something random.
	saveUninitialized: true,
	resave: true,
});

//initialize express session
app.use(sessionDef);

//landing on the homepage
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

//entering a game room
app.get('/game*', (req, res) => {
	//note: in this context, req.session refers to same object as socket.request.session in socket context. unsure if by value or reference
	if (Object.keys(rooms).includes(req.path.substr(1))) {
		console.log('user accessing game page.');
		res.sendFile(__dirname + '/game.html');
	} else {
		res.send('<h1>Sorry, that is an invalid game session.</h1>');
	}
});

//// Socket Events ////

var homesocket = io.of('/home'); //clientside: socket = io('/home');
var gamesocket = io.of('/game'); //this namespace is for all game rooms. each will have its own socket room and role rooms.

//putting the express session into socket context
io.use(function(socket, next) {
	sessionDef(socket.request, socket.request.res || {}, next);
});

homesocket.on('connection', socket => {
	//what to do upon a new user appearing
	console.log('a user connected to homepage');
	// console.log('session id: ' + socket.request.session.id); //unique user identifier

	//give user list of open public games
	socket.emit('populate rooms', Object.keys(public_rooms));

	socket.on('room create', (room_info) => {
		// names have to be unique and at least one character. arbitrary max of 32
		name = room_info[0]; //eventually should sanitize
		isPublic = room_info[1];
		console.log('length of name: ' + name.length);
		if (!(name.length > 0 && name.length < 33)) {
			socket.emit('warning', 'Room names must be 1-32 characters.');
		} else if (Object.keys(public_rooms).includes(name)) {
			socket.emit('warning', 'Room with this name already exists.');
		} else { //name is valid; make the room.
			room = new Room(name, isPublic);
            room.chatHistory.push('INVITE LINK: ' + url + room.code);
			rooms[room.code] = room; //add this room to the catalog of all rooms
			if (isPublic) {
				public_rooms[name] = room.code;
			}
			console.log('a new room has been created: ' + [name, isPublic]);

			socket.emit('room created', room.code); //tell the client a new room has been created and give them the URL to it
		}
	});
});

gamesocket.on('connection', socket => {
    console.log('a user connected to game page');
    let roomToJoin = socket.handshake.headers.referer.toString().split('/').pop().substr(0,8);

    //note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
    let SESSION_ID = socket.request.session.id;
    
	//check if the room still exists
    if (Object.keys(rooms).includes(roomToJoin)) { //if the room exists...
		//put the user in a socket room for the particular game room they're trying to enter
        socket.join(roomToJoin);
        //check if a game has begun
        if (rooms[roomToJoin].game != null) {
            //put the user is a socket room for their particular role in the game
            if (rooms[roomToJoin].game.players[SESSION_ID].role != 'Villager') {
                //e.g. rooms for mafia in a game are id'd by gameXXXXgameXXXX where the first half is the game room and second half id's the role
                socket.join(roomToJoin+rooms[roomToJoin].game.roleRoomCodes[rooms[roomToJoin].game.players[SESSION_ID].role]);
            }
        }
		//provide user with (public) room information
        //socket.emit('room update', rooms[socket.request.session.socketRoomToJoin].clientPackage());

    }
    // socket.on('game start', () => {
    //     rooms[roomToJoin].game = new Game(rooms[roomToJoin].members, 0, 0, 0)
    // })

	socket.on('public message', (msg) => {
		let time_appended_msg = currentTime() + text; //format the message
		rooms[roomToJoin].chatHistory.push(time_appended_msg); //add the message to the room's chat history
		console.log('message in room ' + roomToJoin + ':' + time_appended_msg); //print the chat message event
		gamesocket.emit('new chat', time_appended_msg); //send message to everyone on a game page
    });
    socket.on('private message', (msg) => {
        let sender_role = rooms[roomToJoin].game.players[SESSION_ID].role;
        let sender_name = rooms[roomToJoin].game.players[SESSION_ID].username;
        console.log('private message to all' + sender_role + ' in room ' + roomToJoin + ':' + msg); //print the chat message event
        if (sender_role != 'Villager') { //everyone except villagers can send chats to everyone of their own role. even spectators can talk to each other privately.
            let formatted_msg = rooms[roomToJoin].sendPrivateMessage(sender_role, sender_name, msg);
            gamesocket.in(roomToJoin+rooms[roomToJoin].game.roleRoomCodes[sender_role]).emit('new private chat', formatted_msg);
        }        
    });

	socket.on('disconnect', () => {
		//what to do upon new user disappearing
		//TODO: announce to gamelog who has disconnected
		console.log('user disconnected');
	});
});

http.listen(port, () => {
	console.log('listening on *:' + port);
});
