class Game {
	constructor(players, numSheriff, numDoctors, numMafia) {
		// Check for irregularities. Ex. numRoles can't be greater than # of players
		this.players = players;
		this.numSheriff = numSheriff;
		this.numDoctors = numDoctors;
		this.numMafia = numMafia;
		this.setAllRoles(players);
	}

	setAllRoles() {
		const numPlayers = Object.keys(this.players).length;
		const numVillagers = numPlayers - this.numSheriff - this.numDoctors - this.numMafia;
		this.setPlayerRole(this.numSheriff, 'Sheriff');
		this.setPlayerRole(this.numDoctors, 'Doctor');
		this.setPlayerRole(this.numMafia, 'Mafia');
		this.setPlayerRole(numVillagers, 'Villager');
	}

	setPlayerRole(numRole, role) {
		const uniqueIDs = Object.keys(this.players);
		const numPlayers = Object.keys(this.players).length;

		for (let index = 0; index < numRole; index++) {
			let randomUser = randomNumBetween(0, numPlayers - 1);
			let userChosen = false;

			while (!userChosen) {
				if (this.players[uniqueIDs[randomUser]].getRole() == null) {
					this.players[uniqueIDs[randomUser]].setRole(role);
					userChosen = true;
				}
				randomUser = randomNumBetween(0, numPlayers - 1);
			}
		}
	}

	getPlayers() {
		console.log(this.players);
	}
}

class PlayerInfo {
	constructor(username) {
		this.role = null;
		this.username = username;
	}

	setRole(role) {
		this.role = role;
	}
	getRole() {
		return this.role;
	}
}

function randomNumBetween(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ========================================
// =============== TESTING ================
// ========================================

const numSheriff = 1;
const numDoctors = 1;
const numMafia = 2;
const numVillagers = 4;

const players = {
	u_1: new PlayerInfo('user_1'),
	u_2: new PlayerInfo('user_2'),
	u_3: new PlayerInfo('user_3'),
	u_4: new PlayerInfo('user_4'),
	u_5: new PlayerInfo('user_5'),
	u_6: new PlayerInfo('user_6'),
	u_7: new PlayerInfo('user_7'),
	u_8: new PlayerInfo('user_8'),
};

let game = new Game(players, numSheriff, numDoctors, numMafia);
game.getPlayers();

/* Game Class
General
- Idea is that whoever loads up the page should receive all of this public information 
- This means that every client only needs this subobject to setup the page
- Info received from clients should update the Game object and send back Game.PublicData


Properties
- Who the players are 
- Who the mafia are 
- Progress of game 
- Public Info
    - Who is still alive
    - Usernames
 */

/* PlayerInfo Struct
General
- Contains information about the player info
- Ex. Role, 

Properties

 */
