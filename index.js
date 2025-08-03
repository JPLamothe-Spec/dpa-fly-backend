const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Root health check route
app.get("/", (req, res) => {
  res.status(200).send("Fly.io root OK");
});

// ✅ GET route for Twilio webhook testing
app.get("/twilio/voice", (req, res) => {
  res.status(200).send("GET OK");
});

// ✅ POST route triggered by Twilio when a call comes in
app.post("/twilio/voice", (req, res) => {
  console.log("🎯 Twilio webhook hit");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you.</Say>
  <Start>
    <Stream url="wss://dpa-fly-backend.fly.dev/media-stream" track="inbound_track"/>
  </Start>
</Response>`;

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml, 'utf8'));
  res.status(200).send(twiml);
});

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ WebSocket server for /media-stream endpoint
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

// ✅ Handle WebSocket audio stream from Twilio
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

// ✅ Start the HTTP server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
