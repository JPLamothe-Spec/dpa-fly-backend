// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const { startAIStream, sendAudioToAI, closeAIStream } = require("./openaiStream");
const { startTranscoder, pipeToTranscoder } = require("./transcoder");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

// ✅ Twilio webhook to start streaming
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="30"/>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ HTTP Server + WebSocket handler
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ✅ WebSocket connection from Twilio media stream
wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  let currentStreamSid = null;
  let isStreamAlive = true;
  let transcoderReady = false;
  let audioBufferQueue = [];

  const handleTranscript = async (text) => {
    console.log("📝 GPT Response:", text);
    // No TTS yet — transcript-only
  };

  // ✅ Start transcoder and wait until it's ready
  startTranscoder((chunk) => {
    transcoderReady = true;

    // Flush any buffered audio
    if (audioBufferQueue.length > 0) {
      audioBufferQueue.forEach((buf) => pipeToTranscoder(buf));
      audioBufferQueue = [];
    }

    // ✅ Start GPT stream *after* transcoder is ready
    startAIStream(
      handleTranscript,
      "You are Anna, JP’s friendly digital personal assistant. Greet the caller and ask how you can help.",
      () => {
        console.log("🧠 GPT-4o text stream ready");
      }
    );

    if (isStreamAlive) sendAudioToAI(chunk);
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === "media" && data.media?.payload) {
        const track = data.media.track || "inbound";
        if (track === "inbound") {
          if (!currentStreamSid && data.streamSid) {
            currentStreamSid = data.streamSid;
            console.log("🔗 Captured streamSid:", currentStreamSid);
          }
          const audioBuffer = Buffer.from(data.media.payload, "base64");

          if (transcoderReady) {
            pipeToTranscoder(audioBuffer);
          } else {
            audioBufferQueue.push(audioBuffer);
            console.log("⚠️ Buffering audio until transcoder is ready");
          }
        }
      } else if (data.event === "stop") {
        console.log("⛔ Twilio stream stopped");
        isStreamAlive = false;
        closeAIStream();
      }
    } catch (err) {
      console.error("❌ WebSocket message error:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
    isStreamAlive = false;
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    isStreamAlive = false;
    closeAIStream();
  });
});

// ✅ Health check route
app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
