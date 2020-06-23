const Message = require('./message');
const Ballot = require('./ballot');
const g = require('./global');

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
        this.active_ballot_results = {Mafia: false, Sheriff: false, Doctor: false}; //status of ballots
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
		// e.g. [sherriff, doctor, mafia, villager, villager]
		let playerSessionIDs = Object.keys(this.players); //list of session IDs
		while (roleLabels.length != 0) {
			// perform until no more labels to give/roles to assign
			const role_index = g.randomNumBetween(0, roleLabels.length - 1);
			const player_index = g.randomNumBetween(0, playerSessionIDs.length - 1);
			const playerSessionID = playerSessionIDs[player_index];
			this.players[playerSessionID].setRole(roleLabels[role_index]);
			playerSessionIDs.splice(player_index, 1);
			roleLabels.splice(role_index, 1);
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
        // Clear Ballot Results, and track only those role ballots with remaining players
        this.active_ballot_results = {};
        if (this.getPlayersWithRole('Mafia').length > 0) {
            this.active_ballot_results['Mafia'] = false;
        }
        else {
            // TODO: Implement Game Over
            // this.gameOver(), perhaps
        }
        if (this.getPlayersWithRole('Doctor').length > 0) {
            this.active_ballot_results['Doctor'] = false;
        }
        if (this.getPlayersWithRole('Sheriff').length > 0) {
            this.active_ballot_results['Sheriff'] = false;
        }
        // Generate Clean Ballots
		this.ballots = {
			Mafia: new Ballot(this.players, 'Mafia'),
			Sheriff: new Ballot(this.players, 'Sheriff'),
			Doctor: new Ballot(this.players, 'Doctor'),
			Village: new Ballot(this.players, 'Village'),
		};
		// Move on to the next game phase
		this.gamePhase == 'Day' ? (this.gamePhase = 'Night') : (this.gamePhase = 'Day');
	}
	actions(role) {
		//contents of the action box for each type of player
		if (this.gamePhase == 'Day') {
			return {
				prompt: 'It is daytime in the town. Select who to execute',
				choices: this.ballots['Village'].getChoices(),
				teammates: this.ballots['Village'].getTeammates(),
				confirmationCount: this.ballots['Village'].numConfirmed(),
				votesNeeded: this.ballots['Village'].numVotesRequired(),
			};
		} else {
			// It's Night
			switch (role) {
				case 'Mafia':
					return {
						prompt: 'Select who to kill',
						choices: this.ballots['Mafia'].getChoices(),
						teammates: this.ballots['Mafia'].getTeammates(),
						confirmationCount: this.ballots['Mafia'].numConfirmed(),
						votesNeeded: this.ballots['Mafia'].numVotesRequired(),
					};
					break;
				case 'Doctor':
					return {
						prompt: 'Select who to save',
						choices: this.ballots['Doctor'].getChoices(),
						teammates: this.ballots['Doctor'].getTeammates(),
						confirmationCount: this.ballots['Doctor'].numConfirmed(),
						votesNeeded: this.ballots['Doctor'].numVotesRequired(),
					};
					break;
				case 'Sheriff':
					return {
						prompt: 'Select who to investigate',
						choices: this.ballots['Sheriff'].getChoices(),
						teammates: this.ballots['Sheriff'].getTeammates(),
						confirmationCount: this.ballots['Sheriff'].numConfirmed(),
						votesNeeded: this.ballots['Sheriff'].numVotesRequired(),
					};
					break;
				default:
					//villagers
					return {
						prompt: '',
						choices: [],
						teammates: [],
						confirmationCount: '',
						votesNeeded: '',
					};
					break;
			}
		}
	}
	sendPrivateMessage(text, to, from = '', type = 'System') {
		//to == role; from == session ID
        //type == 'Private' or 'System'
        let message = this.players[from] ? new Message(text, type, this.players[from].username, to) : new Message(text, type, '', to);
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
		} else {
			// It's Night. Cast vote in the appropriate ballot
			this.ballots[voter_role].castVote(vote);
		}
	}
	unconfirmVote(sessionID) {
		// Handling if a voter unchecks their box
		let voter_role = this.players[sessionID].role;
		if (this.gamePhase == 'Day') {
			this.ballots['Village'].unconfirmVote(this.players[sessionID].username);
		} else {
			// It's Night. Confirm vote in the appropriate ballot
			this.ballots[voter_role].unconfirmVote(this.players[sessionID].username);
        }
        return false;
	}
	confirmVote(sessionID) {
		// Handling if a voter checks their box
		let voter_role = this.players[sessionID].role;
		if (this.gamePhase == 'Day') {
			let vote_result = this.ballots['Village'].confirmVote(this.players[sessionID].username); // Either session id of victim or false
			if (vote_result) {
                // Group has decided to execute a player. Carry it out
                this.players[vote_result].kill();
                // Move the game forward
                this.advance();
                // Return a message for the public log
                return g.someoneExecutedMessage(this.players[vote_result].username);
			}
		} else {
			// It's Night. Confirm vote in the appropriate ballot
			let vote_result = this.ballots[voter_role].confirmVote(this.players[sessionID].username);
			if (vote_result) {
                // Also store this information somewhere in Game so that upon game.advance() we can kill killed players and save saved players etc
                this.active_ballot_results[voter_role] = vote_result;
                this.sendPrivateMessage(this.players[vote_result].username + ' was chosen.', voter_role);
                if (!(Object.values(this.active_ballot_results).includes(false))) {
                    // All nightly ballots have closed. Calculate results.
                    let mafia_result = this.active_ballot_results['Mafia'];
                    let sheriff_result = this.active_ballot_results['Sheriff'];
                    let doctor_result = this.active_ballot_results['Doctor'];
                    // Inform sheriff about who they investigated. Right now, this is the role. Possibly this should only be mafia or not
                    this.sendPrivateMessage('Your investigation finds that ' + this.players[sheriff_result].username + '\'s role is: ' + this.players[sheriff_result].role, 'Sheriff');
                    // Carry out result of mafia-doctor stuff
                    if (mafia_result == doctor_result) {
                        // No one dies
                        // Move the game forward
                        this.advance();
                        this.sendPrivateMessage('You are surprised to hear that ' + this.players[mafia_result].username + ' survived.', 'Mafia');
                        this.sendPrivateMessage('Thanks to you, a life was saved last night.', 'Doctor');
                        return g.noOneDiedMessage(this.getPlayerList('Alive'));
                    }
                    else {
                        this.players[mafia_result].kill();
                        // Move the game forward
                        this.advance();
                        this.sendPrivateMessage('You pretend to be shocked at the news about ' + this.players[mafia_result].username + '.', 'Mafia');
                        return g.someoneDiedMessage(this.players[mafia_result].username);
                    }
                }
			}
        }
        return false;
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
