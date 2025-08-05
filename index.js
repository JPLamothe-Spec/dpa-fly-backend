// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const { startGeminiStream } = require("./geminiStream"); // ✅ Gemini stub
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Health check
app.get("/", (req, res) => res.status(200).send("OK"));

// ✅ Parse Twilio webhook data
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Twilio <Start><Stream> response
app.post("/twilio/voice", (req, res) => {
  console.log("📞 Twilio webhook hit");

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="1"/>
    </Response>
  `.trim();

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server for Twilio stream
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  // 🔁 Connect to Gemini in the background (non-blocking)
  let gemini = null;
  startGeminiStream((transcript) => {
    console.log("🧠 Gemini Transcript:", transcript);
  }).then(({ streamAudio }) => {
    gemini = { streamAudio };
    console.log("🧠 Gemini stream ready");
  }).catch((err) => {
    console.error("❌ Gemini connection failed:", err);
  });

  // ✅ Receive Twilio media stream
  ws.on("message", (msg) => {
    console.log("📨 Media Stream Message:", msg.toString().slice(0, 100), "...");
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });
});

// ✅ Upgrade HTTP to WebSocket
server.on("upgrade", (req, socket, head) => {
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

