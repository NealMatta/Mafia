const Message = require('./message');
const Ballot = require('./ballot');
const g = require('./global');
const { generateRoomCode } = require('./global');

class Game {
	constructor(players, numSheriff, numDoctors, numMafia) {
		// Check for irregularities. Ex. numRoles can't be greater than # of players
		this.players = players; //object with name:value pairs sessionID:Player
		this.numSheriff = numSheriff;
		this.numDoctors = numDoctors;
		this.numMafia = numMafia;
		this.assignRoles();
        this.playerkey = players; //holds original roles, for distribution in postgame
        this.ballots = {}; //collection of active Ballot objects
        this.gamePhase = 'Night';
        this.advance(); // Move forward from night to day and instantiate the first ballot
		this.roleRoomCodes = {
			Mafia: g.generateRoomCode(),
			Sheriff: g.generateRoomCode(),
			Doctor: g.generateRoomCode(),
			Spectator: g.generateRoomCode(),
		};
	}
	assignRoles() {
		this.numVillagers = Object.keys(this.players).length - this.numSheriff - this.numDoctors - this.numMafia;
		let part1 = Array(this.numSheriff).fill('Sheriff');
		let part2 = Array(this.numDoctors).fill('Doctor');
		let part3 = Array(this.numMafia).fill('Mafia');
		let part4 = Array(this.numVillagers).fill('Villager');
		let roleLabels = part1.concat(part2, part3, part4);
		// [sherrify, doctor, mafia, villager, villager]
		let playerSessionIDs = Object.keys(this.players); //list of session IDs
		while (roleLabels.length != 0) {
			// perform until no more labels to give/roles to assign
            const role_index = g.randomNumBetween(0, roleLabels.length - 1);
            console.log('randomly picked role ', role_index, ': ', roleLabels[role_index]);
            const player_index = g.randomNumBetween(0, playerSessionIDs.length - 1);
            const playerSessionID = playerSessionIDs[player_index];
            console.log('randomly picked player: ', playerSessionID)
            this.players[playerSessionID].setRole(roleLabels[role_index]);
            playerSessionIDs.splice(player_index, 1);
            roleLabels.splice(role_index, 1);
		}
		console.log('players', this.players)
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
        // Generate Clean Ballots
        this.ballots = {
            'Mafia': new Ballot(this.players, 'Mafia'),
            'Sheriff': new Ballot(this.players, 'Sheriff'),
            'Doctor': new Ballot(this.players, 'Doctor'),
            'Village': new Ballot(this.players, 'Village'),
        }
        // Move on to the next game phase
        this.gamePhase == 'Day'
            ? this.gamePhase = 'Night'
            : this.gamePhase = 'Day';
	}
	actions(role) {
		//contents of the action box for each type of player
		if (this.gamePhase == 'Day') {
			return {
				prompt: 'It is daytime in the town. Select who to execute',
				choices: this.ballots['Village'].getChoices(),
				teammates: this.ballots['Village'].getTeammates(),
			};
		} else {
			// It's Night
			switch (role) {
				case 'Mafia':
					return {
						prompt: 'Select who to kill',
						choices: this.ballots['Mafia'].getChoices(),
						teammates: this.ballots['Mafia'].getTeammates()
					};
					break;
				case 'Doctor':
					return {
						prompt: 'Select who to save',
						choices: this.ballots['Doctor'].getChoices(),
						teammates: this.ballots['Doctor'].getTeammates()
					};
					break;
				case 'Sheriff':
					return {
						prompt: 'Select who to investigate',
						choices: this.ballots['Sheriff'].getChoices(), 
						teammates: this.ballots['Sheriff'].getTeammates()
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
	sendPrivateMessage(text, to, from='', type='System') {
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
    vote(sessionID, vote) {
        let voter_role = this.players[sessionID].role;
        if (this.gamePhase == 'Day') {
            this.ballots['Village'].castVote(vote);
        }
        else {
            // It's Night. Cast vote in the appropriate ballot
            this.ballots[voter_role].castVote(vote);
        }
    }
    unconfirmVote(sessionID) {
        // Handling if a voter unchecks their box
        let voter_role = this.players[sessionID].role;
        if (this.gamePhase == 'Day') {
            this.ballots['Village'].unconfirmVote(players[sessionID.username]);
        }
        else {
            // It's Night. Confirm vote in the appropriate ballot
            this.ballots[voter_role].unconfirmVote(players[sessionID.username]);
        }
    }
    confirmVote(sessionID) {
        // Handling if a voter checks their box
        let voter_role = this.players[sessionID].role;
        if (this.gamePhase == 'Day') {
            let vote_result = this.ballots['Village'].confirmVote(this.players[sessionID.username]);
            if (vote_result)  {
                // Also store this information somewhere in Game so that upon game.advance() we can kill killed players and save saved players etc
                // Need a way also, possibly along the same pipeline, to notify public room chat of a public execution
            }
        }
        else {
            // It's Night. Confirm vote in the appropriate ballot
            let vote_result = this.ballots[voter_role].confirmVote(this.players[sessionID.username]);
            if (vote_result)  {
                // Also store this information somewhere in Game so that upon game.advance() we can kill killed players and save saved players etc
                this.sendPrivateMessage(this.players[vote_result].username + ' was chosen.', voter_role)
            }
        }
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
