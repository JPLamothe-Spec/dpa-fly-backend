// index.js
const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
require("dotenv").config();

const {
  startAIStream,
  sendAudioToAI,
  commitAudioToAI,
  closeAIStream
} = require("./openaiStream");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Telnyx webhook to start streaming with PCM @ 16kHz
app.post("/telnyx-stream", (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx call`);

  res.json({
    instructions: [
      {
        name: "streaming_start",
        params: {
          url: "wss://dpa-fly-backend-ufegxw.fly.dev/telnyx-stream", // ✅ matches your domain
          audio: {
            format: "pcm_s16le",   // 16-bit PCM
            sample_rate: 16000     // 16 kHz
          }
        }
      }
    ]
  });
});

const server = http.createServer(app);

// ✅ WebSocket server for Telnyx media
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/telnyx-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established with Telnyx");

  // 🔹 Start GPT AI stream
  startAIStream({
    onTranscript: (text) => {
      console.log("📝 Partial transcript:", text);
    },
    onClose: () => {
      console.log("❌ AI stream closed");
    },
    onReady: () => {
      console.log("🧠 AI stream ready");
    }
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.event === "media" && msg.media?.payload) {
        const audioBuffer = Buffer.from(msg.media.payload, "base64");
        console.log(`🎧 Received ${audioBuffer.length} bytes PCM audio`);
        sendAudioToAI(audioBuffer); // ✅ send to GPT
      }

      if (msg.event === "stop") {
        console.log("⏹ Telnyx stream stopped");
        commitAudioToAI(); // ✅ tell GPT to process
        closeAIStream();
        ws.close();
      }
    } catch (err) {
      console.error("⚠️ Error parsing Telnyx message:", err);
    }
  });

  ws.on("close", () => {
    console.log("🔌 Telnyx WebSocket closed");
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    closeAIStream();
  });
});

app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

