// index.js
const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
require("dotenv").config();

const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Telnyx webhook to start streaming
app.post("/telnyx-stream", (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx call`);

  res.json({
    instructions: [
      {
        name: "streaming_start",
        params: {
          url: `wss://${req.headers.host}/telnyx-stream`
        }
      }
    ]
  });
});

const server = http.createServer(app);

// ✅ WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Upgrade for Telnyx media stream
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/telnyx-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established with Telnyx");

  // Start FFmpeg transcoder (mulaw@8000 → s16le@16000)
  const ffmpeg = spawn(require("ffmpeg-static"), [
    "-f", "mulaw",
    "-ar", "8000",
    "-ac", "1",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "16000",
    "-"
  ]);

  ffmpeg.stdout.on("data", (chunk) => {
    // Here’s where you’d send audio to AI
    console.log(`🎧 Received ${chunk.length} bytes from FFmpeg`);
  });

  ffmpeg.stderr.on("data", (data) => {
    // FFmpeg logs
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.event === "media" && msg.media && msg.media.payload) {
        const audioBuffer = Buffer.from(msg.media.payload, "base64");
        ffmpeg.stdin.write(audioBuffer);
      }

      if (msg.event === "stop") {
        console.log("⏹ Telnyx stream stopped");
        ffmpeg.stdin.end();
        ws.close();
      }
    } catch (err) {
      console.error("⚠️ Error parsing Telnyx message:", err);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket closed");
    ffmpeg.kill("SIGINT");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    ffmpeg.kill("SIGINT");
  });
});

app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
