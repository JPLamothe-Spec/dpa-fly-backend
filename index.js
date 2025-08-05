// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const { startGeminiStream } = require("./geminiStream");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ✅ Health check
app.get("/", (req, res) => res.status(200).send("OK"));

// ✅ Parse POST body
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Twilio Voice Webhook — return <Start><Stream> immediately
app.post("/twilio/voice", (req, res) => {
  console.log("📞 Twilio webhook hit");

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `.trim();

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server for Twilio <Stream>
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (twilioWs) => {
  console.log("✅ WebSocket connection from Twilio established");

  let gemini = null;

  // 🔁 Start Gemini stream asynchronously (do NOT block Twilio)
  startGeminiStream((transcript) => {
    console.log("📝 Transcript from Gemini:", transcript);
  }).then(({ streamAudio }) => {
    gemini = { streamAudio };
    console.log("🧠 Gemini stream ready");
  }).catch((err) => {
    console.error("❌ Failed to start Gemini stream:", err);
  });

  twilioWs.on("message", (msg) => {
    try {
      const message = JSON.parse(msg);
      if (message.event === "media" && message.media?.payload) {
        if (gemini?.streamAudio) {
          gemini.streamAudio(message.media.payload);
        }
      } else if (message.event === "start") {
        console.log("🔔 Twilio stream started");
      }
    } catch (err) {
      console.error("❌ Error handling Twilio message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ WebSocket from Twilio closed");
  });
});

// ✅ Upgrade HTTP connection to WebSocket
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

// ✅ Start the server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
