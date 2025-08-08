// index.js
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const { createServer } = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const PUBLIC_WS_URL = "wss://dpa-fly-backend-ufegxw.fly.dev/media-stream"; // Your public WebSocket endpoint

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).send("DPA backend is live");
});

// Telnyx webhook handler
app.post("/telnyx-stream", async (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx event`);
  console.log("🔍 Telnyx POST body:", JSON.stringify(req.body, null, 2));

  const eventType = req.body?.data?.event_type;
  const payload = req.body?.data?.payload;

  if (eventType === "call.answered" && payload?.call_control_id) {
    const callControlId = payload.call_control_id;
    console.log(`🎯 Starting media stream for Call Control ID: ${callControlId}`);

    try {
      const resp = await fetch(`https://api.telnyx.com/v2/call_controls/${callControlId}/actions/stream_start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stream_url: PUBLIC_WS_URL,
          audio_format: "audio/l16;rate=16000" // 16kHz PCM audio for GPT
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error("❌ Failed to start Telnyx media stream:", data);
      } else {
        console.log("✅ Media stream started successfully:", data);
      }
    } catch (err) {
      console.error("❌ Error calling Telnyx API:", err);
    }
  }

  res.status(200).send("ok");
});

// Setup HTTP and WebSocket servers
const server = createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🔗 Telnyx media WebSocket connected ✅");

      ws.on("message", (msg) => {
        console.log(`🎵 Received audio frame: ${msg.length} bytes`);
        // TODO: Forward audio to GPT stream here
      });

      ws.on("close", () => {
        console.log("❌ Telnyx media WebSocket closed");
      });
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
