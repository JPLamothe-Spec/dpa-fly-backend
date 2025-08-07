// index.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
dotenv.config();

const startTranscoder = require("./transcoder");
const startAIStream = require("./openaiStream");
const synthesizeAndSend = require("./openaiTTS");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

// 🧠 Global state
let aiStream = null;
let twilioSocket = null;
let transcoderReady = false;
let isStreamAlive = true;

// ✅ Twilio Webhook – answers call & starts media stream
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="60"/>
    </Response>
  `;
  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml.trim());
});

// ✅ Create server + WebSocket layer
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// 🔌 Handle WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleTwilioStream(ws);
    });
  }
});

// 🎧 Handle Twilio media stream
function handleTwilioStream(ws) {
  console.log("✅ WebSocket connection established");
  twilioSocket = ws;
  isStreamAlive = true;
  transcoderReady = false;

  let streamSid = null;

  // ✅ Start AI stream
  aiStream = startAIStream(async (transcript) => {
    console.log(`[${new Date().toISOString()}] 📝 Transcript: ${transcript}`);
    if (twilioSocket && twilioSocket.readyState === WebSocket.OPEN) {
      await synthesizeAndSend(transcript, twilioSocket);
    } else {
      console.log("⚠️ TTS skipped – WebSocket already closed");
    }
  });

  // ⏱️ Delay FFmpeg startup to avoid missed audio
  setTimeout(() => {
    startTranscoder((chunk) => {
      if (!transcoderReady) {
        transcoderReady = true;
        console.log("🎙️ Transcoder is now ready");
      }
      if (isStreamAlive) {
        aiStream.sendAudio(chunk);
      }
    });
  }, 100);

  // 🔄 Incoming Twilio audio
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.event === "start") {
      streamSid = data.streamSid;
      console.log(`🔗 Captured streamSid: ${streamSid}`);
    }
    if (data.event === "media" && transcoderReady) {
      const audio = Buffer.from(data.media.payload, "base64");
      aiStream.write(audio);
    }
    if (data.event === "stop") {
      console.log(`[${new Date().toISOString()}] ⛔ Twilio stream stopped`);
      isStreamAlive = false;
      aiStream.end();
    }
  });

  ws.on("close", () => {
    console.log(`[${new Date().toISOString()}] ❌ WebSocket connection closed`);
    isStreamAlive = false;
    aiStream.end();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    isStreamAlive = false;
    aiStream.end();
  });
}

// 🩺 Health check
app.get("/", (req, res) => res.status(200).send("✅ DPA backend is live"));

// 🚀 Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
