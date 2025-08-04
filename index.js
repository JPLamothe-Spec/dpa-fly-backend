const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Health check route for Fly.io
app.get("/", (req, res) => {
  res.status(200).send("Fly.io root OK");
});

// ✅ Twilio webhook verification via GET
app.get("/twilio/voice", (req, res) => {
  res.status(200).send("GET OK");
});

// ✅ Main webhook POST from Twilio Voice
app.post("/twilio/voice", (req, res) => {
  console.log("🎯 Twilio webhook hit");

  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Start>
        <Stream url="wss://dpa-fly-backend-ufegxw.fly.dev/media-stream" track="inbound_track"/>
      </Start>
      <Say voice="alice">Please hold while we connect you.</Say>
    </Response>
  `;

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml, "utf8"));
  res.status(200).send(twiml.trim());
});

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ WebSocket upgrade handler
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

// ✅ WebSocket message handler
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

// ✅ Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
