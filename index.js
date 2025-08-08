// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const {
  startAIStream,
  sendAudioToAI,
  commitAudioToAI,
  closeAIStream
} = require("./openaiStream");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

// Health check
app.get("/", (req, res) => res.status(200).send("✅ DPA backend is live"));

// Handle Telnyx WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/telnyx-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection (Telnyx → backend)
wss.on("connection", (ws) => {
  console.log(`[${new Date().toISOString()}] 📡 Telnyx WebSocket connected`);

  let isStreamAlive = true;
  let lastAudioTime = Date.now();
  let silenceTimeout = null;

  // Start GPT Realtime stream
  startAIStream({
    onTranscript: (text) => {
      console.log(`[${new Date().toISOString()}] 📝 Transcript:`, text);
    },
    onClose: () => {
      console.log(`[${new Date().toISOString()}] ❌ GPT stream closed`);
      ws.close();
    },
    onReady: () => {
      console.log(`[${new Date().toISOString()}] 🧠 GPT-4o Realtime ready`);
    }
  });

  // Handle Telnyx messages
  ws.on("message", (rawMsg) => {
    try {
      const msg = JSON.parse(rawMsg);

      // PCM audio frame from Telnyx
      if (msg.event === "media") {
        const audio = Buffer.from(msg.media.payload, "base64");
        sendAudioToAI(audio); // send straight to GPT
        lastAudioTime = Date.now();

        // Reset silence timer
        if (silenceTimeout) clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
          console.log(`[${new Date().toISOString()}] ⏸ Silence detected — committing audio`);
          commitAudioToAI();
        }, 1000); // 1s silence triggers commit
      }

      // Call started
      else if (msg.event === "start") {
        console.log(`[${new Date().toISOString()}] ▶️ Call started — Stream ID: ${msg.stream_id}`);
      }

      // Call stopped
      else if (msg.event === "stop") {
        console.log(`[${new Date().toISOString()}] ⛔ Call stopped`);
        isStreamAlive = false;
        commitAudioToAI();
        closeAIStream();
      }

    } catch (err) {
      console.error(`[${new Date().toISOString()}] ⚠️ Error parsing Telnyx WS message:`, err);
    }
  });

  // WebSocket closed
  ws.on("close", () => {
    console.log(`[${new Date().toISOString()}] ❌ Telnyx WebSocket closed`);
    closeAIStream();
  });

  // WebSocket error
  ws.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] ⚠️ Telnyx WebSocket error:`, err);
    closeAIStream();
  });
});

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Server listening on port ${PORT}`);
});
