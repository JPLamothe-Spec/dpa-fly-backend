const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Health check route for Fly.io
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// ✅ Parse incoming POST data
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Twilio webhook route
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Say voice="Polly.Joanna">
        Hi, this is Anna, JP's digital personal assistant, would you like me to pass on a message?
      <Pause length="2"/>
      </Say>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server setup
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (msg) => {
    console.log("📨 Media Stream Message:", msg.toString().slice(0, 80), "...");
    // You can handle audio or events here
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });
});

// ✅ Bind WebSocket upgrade manually
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
