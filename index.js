// index.js
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

// ✅ Root check
app.get("/", (req, res) => {
  res.status(200).send("DPA backend is live");
});

// ✅ Telnyx Webhook
app.post("/telnyx-stream", async (req, res) => {
  console.log(`[${new Date().toISOString()}] 📞 Incoming Telnyx call`);
  console.log("🔍 Telnyx POST body:", JSON.stringify(req.body, null, 2));

  const eventType = req.body?.data?.event_type;
  const payload = req.body?.data?.payload;

  if (eventType === "call.initiated" && payload?.call_control_id) {
    const callControlId = payload.call_control_id;
    console.log(`🎯 Starting media stream for Call Control ID: ${callControlId}`);

    try {
      const resp = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stream_url: `wss://${req.headers.host}/media-stream`, // WebSocket endpoint on our server
          audio_format: "audio/l16;rate=16000", // ✅ 16kHz audio for GPT compatibility
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error("❌ Failed to start media stream:", data);
      } else {
        console.log("✅ Media stream started successfully:", data);
      }
    } catch (err) {
      console.error("❌ Error starting Telnyx media stream:", err);
    }
  }

  res.status(200).send("ok");
});

// ✅ Placeholder WebSocket (to be replaced with GPT handling)
const { createServer } = require("http");
const WebSocket = require("ws");

const server = createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🔗 Telnyx media WebSocket connected ✅");

      ws.on("message", (msg) => {
        console.log("🎵 Received audio frame:", msg.length, "bytes");
        // Here is where we’ll later send audio to GPT in real time
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
