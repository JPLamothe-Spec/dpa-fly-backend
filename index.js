// index.js
const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
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

// ✅ Handle Telnyx webhook events
app.post("/telnyx-stream", async (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx call`);
  console.log("🔍 Telnyx POST body:", JSON.stringify(req.body, null, 2));

  const eventType = req.body.data?.event_type;
  const callControlId = req.body.data?.payload?.call_control_id;
  const host = req.headers.host;

  // Always acknowledge webhook immediately
  res.status(200).send("OK");

  // If it's a new call, start the media stream via Telnyx REST API
  if (eventType === "call.initiated" && callControlId) {
    console.log(`🎯 Starting media stream for Call Control ID: ${callControlId}`);

    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/media_stream_start`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stream_url: `wss://${host}/telnyx-stream`,
          audio_format: {
            type: "pcm_s16le",
            sample_rate: 16000
          }
        })
      });

      if (response.ok) {
        console.log("✅ Media stream start command sent to Telnyx");
      } else {
        console.error("❌ Failed to start media stream:", await response.text());
      }
    } catch (err) {
      console.error("❌ Error starting media stream:", err);
    }
  }
});

const server = http.createServer(app);

// ✅ WebSocket server for Telnyx media
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  console.log("🔍 WS upgrade request URL:", req.url);

  // Accept WS upgrades for /telnyx-stream with or without query params
  if (req.url && req.url.startsWith("/telnyx-stream")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established with Telnyx");

  // Start GPT AI stream
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
        sendAudioToAI(audioBuffer);
      }

      if (msg.event === "stop") {
        console.log("⏹ Telnyx stream stopped");
        commitAudioToAI();
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
