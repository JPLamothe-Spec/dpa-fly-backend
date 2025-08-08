// index.js

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.error("⚠️ Missing TELNYX_API_KEY environment variable");
  process.exit(1);
}

// Start streaming placeholder
function startStreaming(callControlId) {
  console.log(`▶️ Starting stream for call_control_id: ${callControlId}`);
  // TODO: Add your stream_start logic here
}

// Call Control API: answer the call (with v3: prefix stripped)
async function answerCall(callControlId) {
  if (callControlId.startsWith("v3:")) {
    callControlId = callControlId.substring(3);
  }

  const url = `https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Failed to answer call:", errorText);
    } else {
      console.log(`✅ Call answered: ${callControlId}`);
    }
  } catch (err) {
    console.error("❌ Error answering call:", err);
  }
}

// Telnyx webhook
app.post("/telnyx-stream", async (req, res) => {
  const eventType = req.body.data?.event_type || "UNKNOWN";
  let callControlId = req.body.data?.call_control_id || "UNKNOWN";

  console.log(`[${new Date().toISOString()}] Telnyx event received: ${eventType}`);
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  if (eventType === "call.initiated") {
    await answerCall(callControlId);
    startStreaming(callControlId);
  } else if (eventType === "call.answered") {
    startStreaming(callControlId);
  }

  res.status(200).send("ok");
});

// Twilio webhook for media streaming
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `.trim();

  res.type("text/xml");
  res.send(twiml);
});

// HTTP server and WebSocket setup
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (message) => {
    console.log(`📨 Media Stream Message: ${message.length} bytes`);
    // TODO: Handle Twilio audio chunks here
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

app.get("/", (req, res) => {
  res.status(200).send("DPA backend is live");
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
