var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);

const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

function currentTime() {
	//returns current time in "[HH:MM:SS] " 24hr format (string)
	var d = new Date();
	return "[" + d.toTimeString().substr(0, 8) + "] ";
}

app.use("/styles", express.static(__dirname + "/styles")); //provide client with (static) stylesheets

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/index.html");
});

io.on("connection", socket => {
	//what to do upon new user appearing
	//TODO: identify them, assign username, announce to game log who has arrived
	console.log("a user connected");
	socket.on("chat message", msg => {
		var time_appended_msg = currentTime() + msg;
		console.log("message: " + time_appended_msg); //print the chat message event
		io.emit("chat message", time_appended_msg); //send message to everyone including sender
	});
	socket.on("disconnect", () => {
		//what to do upon new user disappearing
		//TODO: announce to gamelog who has disconnected
		console.log("user disconnected");
	});
});

http.listen(port, () => {
	console.log("listening on *:" + port);
});
