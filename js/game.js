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
        this.playerkey = {}; //holds original roles, for distribution in postgame, in format {username:role}
        for (var sid in players) {
            this.playerkey[players[sid].username] = players[sid].role;
        }
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
		//return [{username: username, isDead: isDead, isOnline: isOnline},...]
		var to_return = [];
		if (status == 'Alive') {
			//if status is overrided to only request alive players
			for (var sid in this.players) {
				if (!this.players[sid].isDead) {
					to_return.push({ username: this.players[sid].username, isDead: this.players[sid].isDead, isOnline: this.players[sid].isOnline });
				}
			}
		} else {
			//if an argument is not provided (default behavior)
			for (var sid in this.players) {
				to_return.push({ username: this.players[sid].username, isDead: this.players[sid].isDead, isOnline: this.players[sid].isOnline });
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
        // Clear Ballot Results
        this.active_ballot_results = {};

        // Check for win conditions
        let num_remaining_mafia = this.getPlayersWithRole('Mafia').length;
        let num_remaining_doctor = this.getPlayersWithRole('Doctor').length;
        let num_remaining_sheriff = this.getPlayersWithRole('Sheriff').length;
        
        // Track only the role ballots with remaining players
        if (num_remaining_mafia > 0) {
            this.active_ballot_results['Mafia'] = false;
        }
        if (num_remaining_doctor > 0) {
            this.active_ballot_results['Doctor'] = false;
        }
        if (num_remaining_sheriff.length > 0) {
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
                active: true,
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
                        active: true,
						prompt: 'Select who to kill',
						choices: this.ballots['Mafia'].getChoices(),
						teammates: this.ballots['Mafia'].getTeammates(),
						confirmationCount: this.ballots['Mafia'].numConfirmed(),
						votesNeeded: this.ballots['Mafia'].numVotesRequired(),
					};
					break;
				case 'Doctor':
					return {
                        active: true,
						prompt: 'Select who to save',
						choices: this.ballots['Doctor'].getChoices(),
						teammates: this.ballots['Doctor'].getTeammates(),
						confirmationCount: this.ballots['Doctor'].numConfirmed(),
						votesNeeded: this.ballots['Doctor'].numVotesRequired(),
					};
					break;
				case 'Sheriff':
					return {
                        active: true,
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
                        active: false,
						prompt: 'It is night in the town. The villagers rest.',
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
            if (vote_result == g.ABSTAIN) {
                // Move the game forward
                this.advance();
                // Return a message for the public log
                return g.noOneExecutedMessage(this.getPlayerList('Alive'));
            }
            else if (vote_result) {
                // Group has decided to execute a player. Carry it out
                this.players[vote_result].kill();
                this.players[vote_result].privateLog.push(new Message('You have been executed'));
                // See if the game is over
                if (this.checkIfGameOver()) { return this.checkIfGameOver() };
                // Move the game forward
                this.advance();
                // Return a message for the public log
                return g.someoneExecutedMessage(this.players[vote_result].username);
			}
        }
        else {
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
                        this.sendPrivateMessage('You are surprised to hear that ' + this.players[mafia_result].username + ' survived.', 'Mafia');
                        this.sendPrivateMessage('Thanks to you, a life was saved last night.', 'Doctor');
                        // Move the game forward
                        this.advance();
                        return g.noOneDiedMessage(this.getPlayerList('Alive'));
                    }
                    else {
                        this.players[mafia_result].kill();
                        this.sendPrivateMessage('You pretend to be shocked at the news about ' + this.players[mafia_result].username + '.', 'Mafia');
                        // See if the game is over
                        if (this.checkIfGameOver()) { return this.checkIfGameOver() };
                        // Move the game forward
                        this.advance();
                        return g.someoneDiedMessage(this.players[mafia_result].username);
                    }
                }
			}
        }
        return false;
    }
    playerWentOffline(sessionID) {
        this.players[sessionID].wentOffline();
    }
    playerCameOnline(sessionID) {
        this.players[sessionID].cameOnline();
    }
    checkIfGameOver() {
        // Check for win conditions
        let num_remaining_mafia = this.getPlayersWithRole('Mafia').length;
        let num_remaining_doctor = this.getPlayersWithRole('Doctor').length;
        let num_remaining_sheriff = this.getPlayersWithRole('Sheriff').length;
        let num_remaining_players = this.getPlayerList('Alive').length;

        if (num_remaining_mafia >= num_remaining_players/2) {
            // Mafia wins
            return ['GAME OVER', 'The town has been terrorized. The mafia wins!' , this.playerkey]
        }
        if (num_remaining_mafia == 0) {
            // Town wins
            return ['GAME OVER', 'The town wins! The mafia has been eradicated.' , this.playerkey]
        }
        if (num_remaining_mafia == 1 && num_remaining_doctor == 1 && num_remaining_players == 2) {
            // This is the only possible draw that I can think of
            return ['GAME OVER', 'The game is a draw!' , this.playerkey]
        }
    }
	clientPackage(sessionID) {
		return {
			me: this.players[sessionID], //so client can can read their own privateLog, role, and status
			players: this.getPlayerList(),
			phase: this.gamePhase,
			actions: this.actions(this.players[sessionID].role),
			teammates:
				this.players[sessionID].role == 'Villager'// || this.players[sessionID].role == 'Spectator'
					? []
					: this.getPlayersWithRole(this.players[sessionID].role),
		};
	}
}

module.exports = Game;
