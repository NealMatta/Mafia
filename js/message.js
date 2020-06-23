const g = require('./global');

class Message {
	constructor(text, type = 'System', from = '', to = '') {
		this.content =
			type == 'Private'
				? g.currentTime() + '(' + this.from + ' > ' + to + 's) ' + text
				: type == 'Public'
				? g.currentTime() + from + ': ' + text
				: g.currentTime() + text;
		this.type = type;
	}
}

module.exports = Message;
