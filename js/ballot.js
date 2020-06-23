class Ballot {
    constructor(players, voting_group) {
        this.players = players;
        this.voting_group = voting_group;
        this.isOpen = true;

        this.choices = {}; //key:value is username:boolean, whether it is currently selected
        this.teammates = {}; //key:value is username:boolean, whether teammate has confirmed a vote
        for (var sid in this.players) {
            if (!this.players[sid].isDead) {
                // choices value
                this.choices[this.players[sid].username] = false;
                if (voting_group == 'Village') {
                    this.teammates[this.players[sid].username] = false;
                }
                else if (this.players[sid].role == voting_group) {
                    this.teammates[this.players[sid].username] = false;
                }
            }
        }

        // Threshold to close the ballot
        // I dont think JS has a problem comparing ints and doubles (which we would do when checking if this minimum is reached) but just in case, this is an integer
        this.minimum_required_votes = Math.floor((Object.keys(this.teammates).length / 2) + 1);
        
    }

    castVote(vote) {
        // vote is a username of who to vote for
        // Check if the ballot is still open and make sure the vote is valid
        if (this.isOpen && Object.keys(this.choices).includes(vote)) {
            // Unselect all choices except the newly made choice
            let target1 = this.choices;
            Object.keys(this.choices).forEach(key => { target1[key] = false });
            this.choices[vote] = true;

            let target2 = this.teammates;
            // Clear current confirmations
            Object.keys(this.teammates).forEach(key => { target2[key] = false });
        }
    }

    confirmVote(voter) {
        // voter is a username of the voter
        // Check if the ballot is still open
        if (this.isOpen) {
            this.teammates[voter] = true;

            // Check if voting has come to a conclusion
            if (this.numConfirmed() >= this.minimum_required_votes) {
                return this.close();
                // Returns string session ID of the selected player
            }
            else {
                return false;
                // Return false if voting is still in progress
            }
        }
        else {
            return false
            // Returns false if voting is over. The result (from close()) need only be returned once.
        }
    }

    unconfirmVote(voter) {
        // Check if the ballot is still open
        if (this.isOpen) {
            this.teammates[voter] = false;
        }
    }

    numConfirmed() {
        // Return integer of how many votes are confirmed at the moment
        // i.e. how many values are true in the this.teammates object
        return Object.keys(this.teammates).filter(username => this.teammates[username]).length;
    }

    numVotesRequired() {
        return this.minimum_required_votes;
    }

    userHasConfirmed(user) {
        // user is a username
        return this.teammates[user];
    }

    getChoices() {
        return this.choices;
    }

    getTeammates() {
        return this.teammates;
    }

    close() {
        // Close the Ballot
        this.isOpen = false;
        // Return the outcome of the vote
        let usernameOfSelection = Object.keys(this.choices).filter(username => this.choices[username]); //should be a string with a username
        let idOfSelection = Object.keys(this.players).filter(sid => this.players[sid].username == usernameOfSelection[0]);
        console.log('Closing ballot and returning result: ', idOfSelection[0]); //should be a session ID
        return idOfSelection[0];
    }
}

module.exports = Ballot;