const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Root path to pass Fly.io health check
app.get("/", (req, res) => {
  res.status(200).send("Fly.io root OK");
});

// ✅ GET request for Twilio webhook verification
app.get("/twilio/voice", (req, res) => {
  res.status(200).send("GET OK");
});

// ✅ POST request from Twilio to begin streaming
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

// ✅ Start HTTP server
const server = http.createServer(app);

// ✅ WebSocket setup
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

// ✅ WebSocket connection handler
wss.on("connection", (ws, request) => {
  console.log("🧩 WebSocket connection established");

  ws.on("message", (message) => {
    console.log("🎧 Received message from Twilio:", message.toString());
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
  });
});

// ✅ Start listening
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
