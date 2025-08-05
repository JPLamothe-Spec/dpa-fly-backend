const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Health check for Fly.io
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// ✅ Parse POST data from Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Twilio Voice Webhook — Send <Start><Stream> immediately
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="1"/>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket handler
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (msg) => {
    console.log("📨 Media Stream Message:", msg.toString().slice(0, 100), "...");
    // ✳️ Here is where you’ll connect Gemini later to respond
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });
});

// ✅ Handle WebSocket upgrade manually
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ✅ Start the server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
