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

class Room {
	constructor(name, isPublic, host) {
        this.code = generateRoomCode(); //a code for people to use to join the lobby
        this.chatHistory = []; //array of Messages making up room's entire chat history
                               //contains Messages of type 'Public' and 'System'
		this.name = name; //custom room name
		this.isPublic = isPublic; //whether this room should be advertised on homepage
		this.gameOngoing = false; //this might end up being unnecessary, instead perhaps just checking if game==null
		this.game = null; //null until a game starts. needs to be initialized here so clientPackage() doesn't fail.
        this.members = {}; //contains players (sessionID:Player), populated when people set a username, passed to game upon game start.
                            //after game start, could include spectators?
        this.socket_session_link = {}; //contains (sessionID:socketID), so clientpackages can be distributed to relevant sockets and clients can be tracked through refreshes
        this.host = host; //sessionID of the host, who is given priviledge of starting the game
    }
	addPlayer(socket_id, session_id, username) {
        this.members[session_id] = new Player(username);
        this.updateSocketLink(socket_id, session_id);
    }
    removePlayer(socket_id, session_id) {
        delete this.members[socket_id];
        delete this.socket_session_link[session_id];
    }
    updateSocketLink(socket_id, session_id) {
        this.socket_session_link[session_id] = socket_id;
    }
	startGame(numSheriff, numDoctors, numMafia) {
		this.game = new Game(this.members, numSheriff, numDoctors, numMafia);
		this.gameOngoing = true;
    }
    getMemberList() { //used to populate user list in lobby, primarily for pre-game prep purposes
        let to_return = [];
        for (var sid in this.members) {
            to_return.push(this.members[sid].username);
        }
        return to_return;
    }
	//a singular object to send the client, containing pertinent info and nothing the client shouldn't have access to
	clientPackage(sessionID) {
		return {
			roomname: this.name,
			roomcode: this.code,
            chatHistory: this.chatHistory,
            users_present: this.getMemberList(),
			gameHasBegun: this.gameOngoing, //this might end up being unnecessary, instead perhaps just checking if game==null
            game: (this.game != null) ? this.game.clientPackage(sessionID) : null,
            isHost: (sessionID == this.host) //on client side, if this is true, it will give them options for starting the game
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
            for (var sid in this.players) {
                if (!this.players[sid].isDead) {
                    to_return.push({username:this.players[sid].username, isDead:this.players[sid].isDead})
                }
            }
        }
        else { //if an argument is not provided (default behavior)
            for (var sid in this.players) { 
                to_return.push({username:this.players[sid].username, isDead:this.players[sid].isDead})
            }
        }
        return to_return;
    }
    getPlayersWithRole(role) {
        //return list of usernames
        var to_return = [];
        for (var sid in this.players) {
            if (this.players[sid].role == role) {
                to_return.push(this.players[sid].username)
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
    sendPrivateMessage(to, from, text, type) {
        //to == role; from == session ID
        //type == 'Private' or 'System'
        let message = new Message( text, type, this.players[from].username, to);
        //example output: '[10:14:33] (Alice > Mafia) We should kill Bob'
        for (var sid in this.players) {
            if (this.players[sid].role == to) {
                this.players[sid].privateLog.push(message);
            }
        }
        return message;
    }
	clientPackage(sessionID) {
        return {
            me: this.players[sessionID], //so client can can read their own privateLog, role, and status
            players: this.getPlayerList(),
            phase: this.gamePhase,
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
        this.privateLog = []; //a complete log private to this player. can contain things like... "You investigated Alice -- she is a Villager" or "You and 2 other mafia killed Bob"
                              //contains Message objects of type 'Public' and 'System'
	}
	kill() {
        this.isDead = true; 
        this.role = 'Spectator'
        this.privateLog.push(new Message('You have been killed.'))
    }
    setRole(role) {
        this.role = role;
    }
}

class Message {
    constructor(text, type='System', from='', to='') {
        this.content =
            (type == 'Private') ? currentTime() + '(' + this.from + ' > ' + to + ') ' + text :
            (type == 'Public') ? currentTime() + from + ': ' + text : currentTime() + text;
        this.type = type;
    }
}

//// Express Events ////

app.use('/styles', express.static(__dirname + '/styles')); //provide client with (static) stylesheets
// app.use('/scripts', express.static(__dirname + '/scripts')); //provide client with (static) scripts

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
            room.chatHistory.push(new Message('INVITE LINK: ' + url + room.code));
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
    //parse, from the client url attempt, which room is being joined
    let roomToJoin = socket.handshake.headers.referer.toString().split('/').pop().substr(0,8);

    //note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
    let SESSION_ID = socket.request.session.id;
    
	//check if the room still exists
    if (Object.keys(rooms).includes(roomToJoin)) { //if the room exists...
		//put the user in a socket room for the particular game room they're trying to enter
        socket.join(roomToJoin);
        //check if a game has begun
        if (rooms[roomToJoin].game != null) {
            //check if the user is part of the game, in which case this is a reconnection
            if (Object.keys(rooms[roomToJoin].game.players).includes(SESSION_ID)) {
                rooms[roomToJoin].updateSocketLink(socket.id, SESSION_ID);
                //put the user in a socket room for their particular role in the game (except villagers, who don't have private chat)
                if (rooms[roomToJoin].game.players[SESSION_ID].role != 'Villager') {
                    socket.join(roomToJoin+rooms[roomToJoin].game.roleRoomCodes[rooms[roomToJoin].game.players[SESSION_ID].role]); //e.g. rooms for mafia in a game are id'd by gameXXXXgameXXXX where the first half is the game room and second half id's the role
                }
                //let room know about reconnection
                rooms[roomToJoin].chatHistory.push(new Message(rooms[roomToJoin].game.players[SESSION_ID].username + ' has reconnected.'));
                gamesocket.to(roomToJoin).emit('new chat', time_appended_msg); //push message to everyone else in room
                //provide user with all needed room information
                socket.emit('room update', rooms[roomToJoin].clientPackage(SESSION_ID));
            }
            //if they're not part of the game, add them as spectator //currently should not be implemented because Game doesn't support spectators that well yet
        }
    }

    socket.on('name set', (name, errorback) => {
        //errorback(error_message) is a callback on the clientside that will display the error message when name is invalid
        if (rooms[roomToJoin].getMemberList().includes(name)) {
            errorback('That name is already in use in this game')
        }
        else {
            rooms[roomToJoin].addPlayer(socket.id, SESSION_ID, name);
        }
    });

    socket.on('game start', (options, errorback) => {
        //options should be {mafia:integer, sheriffs:integer, doctors:integer}
        //errorback(error_message) is a callback on the clientside that will display the error message when the game can't be started
        if (Object.keys(rooms[roomToJoin].members).length <= 4) {
            errorback('There must be at least four players to start a game');
        }
        else if ((options.mafia + options.sheriffs + options.doctors) > Object.keys(rooms[roomToJoin].members).length) {
            errorback('Too many roles have been assigned');
        }
        else {
            //create new game
            rooms[roomToJoin].game = new Game(rooms[roomToJoin].members, options.mafia, options.sheriff, options.doctor);
            //start game for everyone by pushing them an update
            //at present, people who haven't set their names will not receive anything from here on out. eventually, spectatorship should be added.
            for (session_id in rooms[roomToJoin].socket_session_link) {
                gamesocket.to(socket_session_link[session_id]).emit('room update', rooms[roomToJoin].clientPackage(session_id));
            }
        }
    })

	socket.on('public message', (text) => {
        //ensure sender is part of the room, meaning they've assigned themselves a name
        if (rooms[roomToJoin].members[SESSION_ID]) {
            let message = new Message(text, 'Public', rooms[roomToJoin].members[SESSION_ID].username)
            rooms[roomToJoin].chatHistory.push(message); //add the message to the room's chat history
            console.log('message in room ' + roomToJoin + ':' + text); //print the chat message event
            gamesocket.in(roomToJoin).emit('new chat', message); //send message to everyone in room
        }
    });

    socket.on('private message', (msg) => {
        let sender_role = rooms[roomToJoin].game.players[SESSION_ID].role;
        let sender_name = rooms[roomToJoin].game.players[SESSION_ID].username;
        console.log('private message to all' + sender_role + ' in room ' + roomToJoin + ':' + msg); //print the chat message event
        if (sender_role != 'Villager') { //everyone except villagers can send chats to everyone of their own role. even spectators can talk to each other privately.
            let message = rooms[roomToJoin].sendPrivateMessage(sender_role, sender_name, msg, 'Private');
            gamesocket.in(roomToJoin+rooms[roomToJoin].game.roleRoomCodes[sender_role]).emit('new private chat', message);
        }
    });

	socket.on('disconnect', () => {
        //if still in pregame stage, remove player from room membership
        if (rooms[roomToJoin].game == null) {
            rooms[roomToJoin].removePlayer(socket.id, SESSION_ID);
        }
        //if the game is ongoing and the disconnecting client was part of it, warn the room of this disconnect
        else if (rooms[roomToJoin].game.players[SESSION_ID]) {
            let msg = new Message(rooms[roomToJoin].game.players[SESSION_ID].username + ' has disconnected.');
            rooms[roomToJoin].chatHistory.push(msg);
            gamesocket.in(roomToJoin).emit('new chat', msg);
        }
		console.log('user disconnected w socket id:' + socket.id);
	});
});

http.listen(port, () => {
	console.log('listening on *:' + port);
});
