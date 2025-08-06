const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");

const { startAIStream, sendAudioToAI, closeAIStream } = require("./openaiStream");
const { startTranscoder, pipeToTranscoder } = require("./transcoder");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// 🧠 GPT connection
let isStreamAlive = false;
let isTranscoderReady = false;
let audioBuffer = [];

// ✅ Twilio webhook for inbound call
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
  res.send(twiml.trim());
});

// ✅ Start HTTP server
const server = http.createServer(app);

// ✅ Attach raw WebSocket handler
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  // 🧠 Start GPT stream
  startAIStream();

  isStreamAlive = true;
  isTranscoderReady = false;
  audioBuffer = [];

  // 🎙️ Start transcoder with GPT piping
  startTranscoder((chunk) => {
    isTranscoderReady = true;
    // Flush any buffered audio first
    while (audioBuffer.length > 0) {
      const buffered = audioBuffer.shift();
      sendAudioToAI(buffered);
    }
    // Then send current chunk
    sendAudioToAI(chunk);
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log(`🔗 Captured streamSid: ${data.streamSid}`);
    }

    if (data.event === "media" && data.media?.payload) {
      const audio = Buffer.from(data.media.payload, "base64");

      if (!isTranscoderReady) {
        console.log("⚠️ Audio skipped — transcoder not ready yet");
        audioBuffer.push(audio);
      } else {
        pipeToTranscoder(audio);
      }
    }

    if (data.event === "stop") {
      console.log("⛔ Twilio stream stopped");
      closeAIStream();
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    closeAIStream();
  });
});

// ✅ Root health check
app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
