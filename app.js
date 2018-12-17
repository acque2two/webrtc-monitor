const express = require('express');
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const PORT = 8080;
 
app.use(express.static("assets"));
 
io.on("connection", (socket) => {
  let roomName = null;
  socket.on("enter", (x) => {
    roomName = x;
    socket.join(roomName);
  });
 
  socket.on("message", (message) => {
    message.from = socket.id;
 
    if (message.type != "call" && message.type != "sdp" && message.type != "candidate" && message.type != "bye") {
      return;
    }
 
    if (message.sendTo) {
      socket.to(message.sendTo).json.emit("message", message);
      return;
    }
 
    if (roomName) socket.broadcast.to(roomName).emit("message", message);
    else socket.broadcast.emit("message", message);
  });
 
  socket.on("disconnect", () => {
    if (roomName) socket.broadcast.to(roomName).emit("message", { from: socket.id, type: "bye"});
    else socket.broadcast.emit("message", { from: socket.id, type: "bye"});
  });
});
 
http.listen(PORT);
