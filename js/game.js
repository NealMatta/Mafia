const Message = require('./message');
const Ballot = require('./ballot');
const g = require('./global');
const Player = require('./player');

class Game {
	constructor(players, numSheriff, numDoctors, numMafia) {
        // Check for irregularities. Ex. numRoles can't be greater than # of players
        this.players = {}; //object with name:value pairs sessionID:Player
        // Populate the players object with clones of the original player objects, so that in-game players are tracked separately from room members.
        for (var p in players) {
            this.players[p] = new Player(players[p].username);
        }
		this.numSheriff = numSheriff;
		this.numDoctors = numDoctors;
		this.numMafia = numMafia;
		this.assignRoles();
        this.playerkey = {'GAME OVER': ''}; //holds original roles, for distribution in postgame, in format {username:role}
        for (var sid in players) {
            this.playerkey[this.players[sid].username] = this.players[sid].role;
        }
        this.ballots = {}; //collection of active Ballot objects
        this.active_ballot_results = {Mafia: false, Sheriff: false, Doctor: false}; //status of ballots
		this.gamePhase = g.PHASE.NIGHT;
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
		let part1 = Array(this.numSheriff).fill(g.ROLE.SHERIFF);
		let part2 = Array(this.numDoctors).fill(g.ROLE.DOCTOR);
		let part3 = Array(this.numMafia).fill(g.ROLE.MAFIA);
		let part4 = Array(this.numVillagers).fill(g.ROLE.VILLAGER);
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
        let num_remaining_mafia = this.getPlayersWithRole(g.ROLE.MAFIA).length;
        let num_remaining_doctor = this.getPlayersWithRole(g.ROLE.DOCTOR).length;
        let num_remaining_sheriff = this.getPlayersWithRole(g.ROLE.SHERIFF).length;
        
        // Track only the role ballots with remaining players
        if (num_remaining_mafia > 0) {
            this.active_ballot_results[g.ROLE.MAFIA] = false;
        }
        if (num_remaining_doctor > 0) {
            this.active_ballot_results[g.ROLE.DOCTOR] = false;
        }
        if (num_remaining_sheriff > 0) {
            this.active_ballot_results[g.ROLE.SHERIFF] = false;
        }

        // Generate Clean Ballots
		this.ballots = {
			Mafia: new Ballot(this.players, g.ROLE.MAFIA),
			Sheriff: new Ballot(this.players, g.ROLE.SHERIFF),
			Doctor: new Ballot(this.players, g.ROLE.DOCTOR),
			Village: new Ballot(this.players, 'Village'),
		};
		// Move on to the next game phase
		this.gamePhase == g.PHASE.DAY ? (this.gamePhase = g.PHASE.NIGHT) : (this.gamePhase = g.PHASE.DAY);
	}
	actions(role) {
		//contents of the action box for each type of player
		if (this.gamePhase == g.PHASE.DAY) {
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
				case g.ROLE.MAFIA:
					return {
						prompt: 'Select who to kill',
						choices: this.ballots[g.ROLE.MAFIA].getChoices(),
						teammates: this.ballots[g.ROLE.MAFIA].getTeammates(),
						confirmationCount: this.ballots[g.ROLE.MAFIA].numConfirmed(),
						votesNeeded: this.ballots[g.ROLE.MAFIA].numVotesRequired(),
					};
					break;
				case g.ROLE.DOCTOR:
					return {
						prompt: 'Select who to save',
						choices: this.ballots[g.ROLE.DOCTOR].getChoices(),
						teammates: this.ballots[g.ROLE.DOCTOR].getTeammates(),
						confirmationCount: this.ballots[g.ROLE.DOCTOR].numConfirmed(),
						votesNeeded: this.ballots[g.ROLE.DOCTOR].numVotesRequired(),
					};
					break;
				case g.ROLE.SHERIFF:
					return {
						prompt: 'Select who to investigate',
						choices: this.ballots[g.ROLE.SHERIFF].getChoices(),
						teammates: this.ballots[g.ROLE.SHERIFF].getTeammates(),
						confirmationCount: this.ballots[g.ROLE.SHERIFF].numConfirmed(),
						votesNeeded: this.ballots[g.ROLE.SHERIFF].numVotesRequired(),
					};
                    break;
				default:
					//villagers
					return {
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
		if (this.gamePhase == g.PHASE.DAY) {
			this.ballots['Village'].castVote(vote);
		} else {
			// It's Night. Cast vote in the appropriate ballot
			this.ballots[voter_role].castVote(vote);
		}
	}
	unconfirmVote(sessionID) {
		// Handling if a voter unchecks their box
		let voter_role = this.players[sessionID].role;
		if (this.gamePhase == g.PHASE.DAY) {
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
		if (this.gamePhase == g.PHASE.DAY) {
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
                console.log('ballot as it stands:', Object.values(this.active_ballot_results));
                console.log(Object.values(this.active_ballot_results).includes(false));
                if (!(Object.values(this.active_ballot_results).includes(false))) {
                    // All nightly ballots have closed. Calculate results.
                    let mafia_result = this.active_ballot_results[g.ROLE.MAFIA];
                    let sheriff_result = this.active_ballot_results[g.ROLE.SHERIFF];
                    let doctor_result = this.active_ballot_results[g.ROLE.DOCTOR];
                    if (sheriff_result) {
                        // Inform sheriff about who they investigated. Right now, this is the role. Possibly this should only be mafia or not
                        this.sendPrivateMessage('Your investigation finds that ' + this.players[sheriff_result].username + '\'s role is: ' + this.players[sheriff_result].role, g.ROLE.SHERIFF);
                    }
                    // Carry out result of mafia-doctor stuff
                    if (mafia_result == doctor_result) {
                        // No one dies
                        this.sendPrivateMessage('You are surprised to hear that ' + this.players[mafia_result].username + ' survived.', g.ROLE.MAFIA);
                        this.sendPrivateMessage('Thanks to you, a life was saved last night.', g.ROLE.DOCTOR);
                        // Move the game forward
                        this.advance();
                        return g.noOneDiedMessage(this.getPlayerList('Alive'));
                    }
                    else {
                        this.players[mafia_result].kill();
                        this.sendPrivateMessage('You pretend to be shocked at the news about ' + this.players[mafia_result].username + '.', g.ROLE.MAFIA);
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
        let num_remaining_mafia = this.getPlayersWithRole(g.ROLE.MAFIA).length;
        let num_remaining_doctor = this.getPlayersWithRole(g.ROLE.DOCTOR).length;
        let num_remaining_sheriff = this.getPlayersWithRole(g.ROLE.SHERIFF).length;
        let num_remaining_players = this.getPlayerList('Alive').length;

        if (num_remaining_mafia > num_remaining_players/2) {
            // Mafia wins
            this.playerkey['GAME OVER'] = 'The town has been terrorized. The mafia wins!';
            return [g.GAMEOVER, 'The town has been terrorized. The mafia wins!' , this.playerkey]
        }
        if (num_remaining_mafia == num_remaining_players/2 && num_remaining_doctor == 0) {
            // Mafia wins
            this.playerkey['GAME OVER'] = 'The town has been terrorized. The mafia wins!';
            return [g.GAMEOVER, 'The town has been terrorized. The mafia wins!' , this.playerkey]
        }
        if (num_remaining_mafia == 0) {
            // Town wins
            this.playerkey['GAME OVER'] = 'The town wins! The mafia has been eradicated.';
            return [g.GAMEOVER, 'The town wins! The mafia has been eradicated.' , this.playerkey]
        }
        if (num_remaining_mafia == 1 && num_remaining_doctor == 1 && num_remaining_players == 2) {
            // This is the only possible draw that I can think of
            this.playerkey['GAME OVER'] = 'The game is a draw!';
            return [g.GAMEOVER, 'The game is a draw!' , this.playerkey]
        }
    }
	clientPackage(sessionID) {
		return {
			me: this.players[sessionID], //so client can can read their own privateLog, role, and status
			players: this.getPlayerList(),
			phase: this.gamePhase,
			actions: this.actions(this.players[sessionID].role),
			teammates:
				this.players[sessionID].role == g.ROLE.VILLAGER// || this.players[sessionID].role == g.ROLE.SPECTATOR
					? []
					: this.getPlayersWithRole(this.players[sessionID].role),
		};
	}
}

module.exports = Game;
