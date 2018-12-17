const socket = io.connect(location.origin);
 
const connectButton = document.getElementById("connect-button");
const sendButton = document.getElementById("send-button");
const messageInputBox = document.getElementById("message");
const messageBox = document.getElementById("message-box");
const roomName = document.getElementById("room-name");
const webrtcMedia = document.getElementById("webrtc-media");
 
let users = [];
let lms = null; // localmediastream
 
const states = {
  get connected() {
    return this._connected;
  },
  // handler for state change
  async connect() {
    this._connected = true;
    socket.emit("enter", roomName.value ? roomName.value : "_default");
    navigator
      .getUserMedia(
        {
          video: true,
          audio: false
        },
        stream => {
          lms = stream;
          const video = addVideo("local");
          video.srcObject = lms;
          video.play();
          socket.send({ type: "call" });
        },
        e => console.error(e)
      );
    connectButton.innerText = "Disconnect";
    roomName.disabled = true;
    sendButton.disabled = false;
 
    messageInputBox.value = "";
    messageInputBox.disabled = false;
  },
  disconnect() {
    this._connected = false;
    connectButton.innerText = "Connect";
    roomName.disabled = false;
    sendButton.disabled = true;
 
    messageInputBox.value = "";
    messageInputBox.disabled = true;
 
    delAllVideo();
 
    if (users.length !== 0) {
      socket.send({ type: "bye" });
      users.forEach(user => {
        user.channel && user.channel.close();
        user.peer.close();
      });
      users = [];
    }
    lms = null;
  }
}
 
const createPeer = id => {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
 
  peer.onicecandidate = event => sendData({ type: "candidate", data: event.candidate }, id);
  peer.ontrack = e => e.streams[0] && addRemoteVideo(id, e.streams[0]);
 
  return peer;
};
 
// automatically choose socket or datachannel and send
const sendData = (data, id) => {
  const user = users.find(x => x.id === id);
 
  if (user && user.channel && user.channel.readyState === "open") {
    user.channel.send(JSON.stringify(data));
  } else {
    data.sendTo = id;
    socket.send(data);
  }
};
 
const handleSocketData = data => {
  handleData(data.from, data);
};
 
const handleRTCData = id => message => {
  handleData(id, JSON.parse(message.data));
};
 
// generic handler for socket and datachannel
const handleData = async (id,  obj) => {
  if (!states.connected) return;
  const type = obj.type;
  const data = obj.data;
 
  if (type === "call") {
    const peer = createPeer(id);
 
    for (const track of lms.getVideoTracks()) {
      peer.addTrack(track, lms);
    }
 
    const offer = await peer.createOffer();
    await peer.setLocalDescription(new RTCSessionDescription(offer));
    sendData({ type: "sdp", data: offer }, id);
 
    const channel = peer.createDataChannel("datachannel");
    channel.onmessage = handleRTCData(id);
 
    users = users.concat({
      id,
      channel,
      peer
    });
  } else if (type === "sdp") {
    const sdp = data;
    // new RTC connection
    if (sdp.type === "offer") {
      const peer = createPeer(id);
      const user = { id, peer };
 
      peer.ondatachannel = async event => {
        const channel = event.channel;
        const label = channel.label;
 
        channel.onmessage = handleRTCData(id);
 
        users = users.map(x => {
          if (x.id === id) {
            x.channel = channel;
          }
          return x;
        });
      };
 
      for (const track of lms.getVideoTracks()) {
        peer.addTrack(track, lms);
      }
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(new RTCSessionDescription(answer))
      sendData({ type: "sdp", data: answer }, user.id);
 
      users = users.concat(user);
    } else if (sdp.type == "answer") {
      const user = users.find(x => x.id === id);
      user.peer.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  } else if (type === "candidate") {
    const user = users.find(x => x.id === id);
    const candidate = data;
    if (user && candidate) user.peer.addIceCandidate(candidate);
  } else if (type === "chat") {
    handleMessage(id, data);
  } else if (type === "bye") {
    const user = users.find(x => x.id === id);
    if (user) {
      user.channel && user.channel.close();
      user.peer.close();
      users = users.filter(x => x.id !== id);
      delVideo(`video-${id}`);
    }
  } else {
    console.error(`unhandled data:${type}`, data);
  }
};
 
// media chat handler
const addRemoteVideo = (id, stream) => {
  const video = addVideo(`video-${id}`);
  stream.onremovetrack = () => {
    delVideo(`video-${id}`);
  };
  video.srcObject = stream;
  video.play();
};
 
const addVideo = id => {
  let video = document.getElementById(id);
  if (video) return video;
  video = document.createElement("video");
  video.id = id;
  video.width = 160;
  webrtcMedia.appendChild(video);
  return video;
};
 
const delVideo = id => {
  const video = document.getElementById(id);
  if (!video) return null;
  if (video) return webrtcMedia.removeChild(video);
};
 
const delAllVideo = () => {
  while (webrtcMedia.firstChild)
    webrtcMedia.removeChild(webrtcMedia.firstChild);
}
 
// chat message handler
const handleMessage = (id, message) => {
  const el = document.createElement("div");
  el.className = "message received-message";
  const nameEl = document.createElement("span");
  const balloonEl = document.createElement("p");
  nameEl.textContent = id;
  balloonEl.textContent = message;
  el.appendChild(nameEl);
  el.appendChild(balloonEl);
  const needsScroll =
    messageBox.scrollTop + messageBox.clientHeight === messageBox.scrollHeight;
  messageBox.appendChild(el);
  if (needsScroll)
    messageBox.scrollTop = messageBox.scrollHeight - messageBox.clientHeight;
};
 
const appendMyMessage = message => {
  const el = document.createElement("div");
  el.className = "message my-message";
  const balloonEl = document.createElement("p");
  balloonEl.textContent = message;
  el.appendChild(balloonEl);
  messageBox.appendChild(el);
  messageBox.scrollTop = messageBox.scrollHeight - messageBox.clientHeight;
};
 
// add event handlers for each button
connectButton.addEventListener("click", () => {
  if (!states.connected)
    states.connect();
  else
    states.disconnect();
});
 
sendButton.addEventListener(
  "click",
  () => {
    const message = messageInputBox.value;
    if (message) {
      for (const user of users)
        sendData({ type: "chat", data: message }, user.id);
 
      appendMyMessage(message);
      messageInputBox.value = "";
      messageInputBox.focus();
    }
  },
  false
);
 
socket.on("message", handleSocketData);
