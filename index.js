const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Hardcoded Fly.io domain to ensure Twilio can stream to it
app.post("/twilio/voice", (req, res) => {
  console.log("🎯 Twilio webhook hit");

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://dpa-fly-backend.fly.dev/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml.trim());
});

const server = http.createServer(app);

// ✅ WebSocket server (manual upgrade path)
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  console.log("🛠 WebSocket upgrade attempt:", request.url);

  socket.on("error", (err) => {
    console.error("💥 WebSocket socket error:", err);
  });

  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ✅ WebSocket connection logic
wss.on("connection", (ws, request) => {
  console.log("🧩 WebSocket connection established");

  ws.on("message", (message) => {
    console.log("🎧 Received message from Twilio:", message.toString());
  });

  ws.on("close", (

