const Message = require('./message');

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
			Mafia: generateRoomCode(),
			Sheriff: generateRoomCode(),
			Doctor: generateRoomCode(),
			Spectator: generateRoomCode(),
		};
	}
	assignRoles() {
		this.numVillagers = Object.keys(this.players).length - this.numSheriff - this.numDoctors - this.numMafia;
		let part1 = Array(this.numSheriff).fill('Sheriff');
		let part2 = Array(this.numDoctors).fill('Doctor');
		let part3 = Array(this.numMafia).fill('Mafia');
		let part4 = Array(this.numVillagers).fill('Villager');
		let roleLabels = part1.concat(part2, part3, part4);
		let players = Object.keys(this.players); //list of session IDs
		while (roleLabels.length != 0) {
			//perform until no more labels to give/roles to assign
			role = roleLabels[randomNumBetween(0, roleLabels.length - 1)];
			player = players[randomNumBetween(0, players.length - 1)];
			this.players[player].setRole(role);
			delete players[player];
			delete roleLabels[role];
		}
	}
	getPlayerList(status = 'All') {
		//return [{username: username, isDead: isDead},...]
		var to_return = [];
		if (status == 'Alive') {
			//if status is overrided to only request alive players
			for (var sid in this.players) {
				if (!this.players[sid].isDead) {
					to_return.push({ username: this.players[sid].username, isDead: this.players[sid].isDead });
				}
			}
		} else {
			//if an argument is not provided (default behavior)
			for (var sid in this.players) {
				to_return.push({ username: this.players[sid].username, isDead: this.players[sid].isDead });
			}
		}
		return to_return;
	}
	getPlayersWithRole(role) {
		//return list of usernames
		var to_return = [];
		for (var sid in this.players) {
			if (this.players[sid].role == role) {
				to_return.push(this.players[sid].username);
			}
		}
		return to_return;
	}
	advance() {
		//move on to the next game phase
		this.gamePhase == 'Day' ? (this.gamePhase = 'Night') : (this.gamePhase = 'Day');
	}
	actions(role) {
		//contents of the action box for each type of player
		if (this.gamePhase == 'Day') {
			return {
				prompt: 'Select who to execute',
				choices: this.getPlayerList('Alive'),
				teammates: this.getPlayerList('Alive'),
			};
		} else {
			// Night
			switch (role) {
				case 'Mafia':
					return {
						prompt: 'Select who to kill',
						choices: this.getPlayerList('Alive'),
						teammates: this.getPlayersWithRole('Mafia'),
					};
					break;
				case 'Doctor':
					return {
						prompt: 'Select who to save',
						choices: this.getPlayerList('Alive'),
						teammates: this.getPlayersWithRole('Doctor'),
					};
					break;
				case 'Sheriff':
					return {
						prompt: 'Select who to investigate',
						choices: this.getPlayerList('Alive'), //perhaps dead or alive? possibly you can investigate dead people? maybe not good strategy but not unrealistic
						teammates: this.getPlayersWithRole('Sheriff'),
					};
					break;
				default:
					//villagers
					return {
						prompt: '',
						choices: [],
						teammates: [],
					};
					break;
			}
		}
	}
	sendPrivateMessage(to, from, text, type) {
		//to == role; from == session ID
		//type == 'Private' or 'System'
		let message = new Message(text, type, this.players[from].username, to);
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
			teammates:
				this.players[sessionID].role == 'Villager' || this.players[sessionID].role == 'Spectator'
					? []
					: this.getPlayersWithRole(this.players[sessionID].role),
		};
	}
}

module.exports = Game;
