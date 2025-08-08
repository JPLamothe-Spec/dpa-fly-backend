// index.js
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
require("dotenv").config();

const { startAIStream, sendAudioToAI, closeAIStream } = require("./stream");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Handle Telnyx initial webhook handshake
app.post("/telnyx-stream", (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx call`);

  // Respond with Call Control instructions to start streaming
  res.json({
    "instructions": [
      {
        "name": "streaming_start",
        "params": {
          "url": `wss://${req.headers.host}/telnyx-stream`
        }
      }
    ]
  });
});

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ WebSocket server
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/telnyx-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", async (ws) => {
  console.log("✅ WebSocket connection established with Telnyx");

  // Start AI stream
  startAIStream({
    onTranscript: (text) => {
      console.log("📝 Transcript:", text);
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

      // Handle incoming audio from Telnyx
      if (msg.event === "media") {
        const audioBuffer = Buffer.from(msg.media.payload, "base64");
        sendAudioToAI(audioBuffer);
      }

      // Handle stop event
      if (msg.event === "stop") {
        console.log("⏹ Telnyx stream stopped");
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
