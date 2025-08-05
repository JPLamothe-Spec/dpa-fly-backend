// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Health check
app.get("/", (req, res) => res.status(200).send("OK"));

// ✅ Parse POST body
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Twilio Voice Webhook — respond with <Start><Stream>
app.post("/twilio/voice", (req, res) => {
  console.log("📞 Twilio webhook hit");

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://dpa-fly-backend-ufegxw.fly.dev/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `.trim();

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server for Twilio <Stream>
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (msg) => {
    console.log("📨 Media Stream Message:", msg.toString().slice(0, 100), "...");
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });
});

// ✅ WebSocket upgrade route
server.on("upgrade", (req, socket, head) => {
  console.log("🔁 WebSocket upgrade request to:", req.url);
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
