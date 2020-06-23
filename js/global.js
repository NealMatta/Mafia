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

function noOneDiedMessage(live_players) {
    //live_players should be an array of usernames
    let choices = [
        'The night passes, taking no lives along with it.',
        'The night comes to an end, leaving behind no casualties.',
        'A scream is heard. ' + live_players[randomNumBetween(0, len(live_players))] + ' saw a spider. Nobody died tonight.',
        'Strange noises were reported coming from the bedroom of ' + live_players[randomNumBetween(0, len(live_players))] + ' last night. No lives were taken.',
        'A peaceful night was had by all.'
    ];
    return choices[randomNumBetween(0, choices.length)];
}

function someoneDiedMessage(who_died) {
    //who_died is a username
    let choices = [
        'In a gruesome scene, ' + who_died + ' was found beaten to death this morning in an alleyway.',
        who_died + ' was found dead this morning.',
        'The head of ' + who_died + ' arrived in a package to the sheriff\'s office this morning.',
        'Under mysterious circumstances, ' + who_died + ' was found dead late last night.',
        who_died + ' has been murdered.',
        'A peaceful night was had by all. Except ' + who_died + ', who died violently.'
    ];
    return choices[randomNumBetween(0, choices.length)];
}

function someoneExecutedMessage(who_died) {
    //who_died is a username
    let choices = [
        'The townspeople came together in a joyous ceremony to take the life of ' + who_died,
        'The townsfolk congregated this afternoon to bring an end to ' + who_died + '\'s life.',
        who_died + ' has been executed under suspicion of mafia affiliation.',
        'Guillotine, meet ' + who_died,
        'An emergency town meeting resulted in the execution of ' + who_died
    ];
    return choices[randomNumBetween(0, choices.length)];
}

module.exports = {
	currentTime,
	randomNumBetween,
    generateRoomCode,
    noOneDiedMessage,
    someoneDiedMessage,
    someoneExecutedMessage
};
