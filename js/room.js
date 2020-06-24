const g = require('./global');
const Game = require('./game');
const Player = require('./player');

class Room {
	constructor(name, isPublic, host) {
		this.code = g.generateRoomCode(); //a code for people to use to join the lobby
		this.chatHistory = []; //array of Messages making up room's entire chat history
		//contains Messages of type 'Public' and 'System'
		this.name = name; //custom room name
		this.isPublic = isPublic; //whether this room should be advertised on homepage
		this.gameOngoing = false; //this might end up being unnecessary, instead perhaps just checking if game==null
        this.game = null; //null until a game starts. needs to be initialized here so clientPackage() doesn't fail.
        this.lastGameKey = null; //everyone's role from the last game. to show in postgame lobby.
		this.members = {}; //contains players (sessionID:Player), populated when people set a username, passed to game upon game start.
		//after game start, could include spectators?
		this.socket_session_link = {}; //contains (sessionID:socketID), so clientpackages can be distributed to relevant sockets and clients can be tracked through refreshes
		this.host = host; //sessionID of the host, who is given priviledge of starting the game
	}
	addPlayer(socket_id, session_id, username) {
		this.members[session_id] = new Player(username.trim());
		this.updateSocketLink(socket_id, session_id);
	}
	removePlayer(socket_id, session_id) {
		delete this.members[session_id];
		delete this.socket_session_link[session_id];
	}
	updateSocketLink(socket_id, session_id) {
		this.socket_session_link[session_id] = socket_id;
	}
	startGame(numSheriff, numDoctors, numMafia) {
		this.game = new Game(this.members, numSheriff, numDoctors, numMafia);
		this.gameOngoing = true;
	}
	getMemberList() {
		//used to populate user list in lobby, primarily for pre-game prep purposes
		let to_return = [];
		for (var sid in this.members) {
			to_return.push(this.members[sid].username);
		}
		return to_return;
    }

    confirmVote(sessionID) {
        // Pipe vote confirmations through here so we can check for game over and intercept
        let result = this.game.confirmVote(sessionID);
        
        // Check for game over
        if (result && result[0] == g.GAMEOVER) {
            this.game = null; // End the game
            this.lastGameKey = result[2];
            return result[1];
        }

        // If the game's not over just pass back result
        else {
            return result;
        }
    }

	//a singular object to send the client, containing pertinent info and nothing the client shouldn't have access to
	clientPackage(sessionID, reconstruction_parameters) {
        // reconstruction_parameters is a boolean vector detailing which parts of the client DOM should be reconstructed
        // options: [public chat, private chat, players, actions, room info, self info]
        // e.g. input: [false, false, false, true, false, true] will destroy & rebuild client action box and self info, nothing else
		return {
            should_reconstruct: reconstruction_parameters,
            myname: this.members[sessionID].username,
			roomname: this.name,
			roomcode: this.code,
			chatHistory: this.chatHistory,
			users_present: this.getMemberList(),
			gameHasBegun: this.gameOngoing, //this might end up being unnecessary, instead perhaps just checking if game==null
			game: this.game != null ? this.game.clientPackage(sessionID) : null,
            isHost: sessionID == this.host, //on client side, if this is true, it will give them options for starting the game
            lastGameResults: this.lastGameKey ? this.lastGameKey : null
		};
	}
}

module.exports = Room;
