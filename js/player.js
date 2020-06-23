const Message = require('./message');

class Player {
	constructor(username) {
		this.username = username;
		this.isDead = false;
		this.privateLog = []; //a complete log private to this player. can contain things like... "You investigated Alice -- she is a Villager" or "You and 2 other mafia killed Bob"
		//contains Message objects of type 'Public' and 'System'
	}
	getUser() {
		return this.username;
	}
	kill() {
		this.isDead = true;
		this.role = 'Spectator';
		this.privateLog.push(new Message('You have been killed.'));
    }
    wentOffline() {
        this.isOnline = false;
    }
    cameOnline() {
        this.isOnline = true;
    }
	setRole(role) {
        this.role = role;
        this.isOnline = true;
	}
}

module.exports = Player;
