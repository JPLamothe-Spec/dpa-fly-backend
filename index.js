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

// In-memory set to track which calls have been answered
const answeredCalls = new Set();

// Start streaming placeholder
function startStreaming(callControlId) {
  console.log(`▶️ Starting stream for call_control_id: ${callControlId}`);
  // TODO: Add your stream_start logic here
}

// Call Control API: answer the call (callControlId is already normalized here)
async function answerCall(callControlId) {
  // Defensive check & strip v3: prefix here if missed earlier
  if (callControlId.startsWith("v3:")) {
    callControlId = callControlId.substring(3);
    console.log("🔧 Stripped 'v3:' prefix, normalized callControlId:", callControlId);
  } else {
    console.log("ℹ️ callControlId does not have 'v3:' prefix:", callControlId);
  }

  // Validate callControlId format (basic UUID-like check)
  const validFormat = /^[a-zA-Z0-9-_]+$/.test(callControlId);
  if (!validFormat) {
    console.error("❌ callControlId format invalid:", callControlId);
    return;
  }

  const url = `https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`;
  console.log(`📞 Sending answer call request to Telnyx API for ID: ${callControlId}`);

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
      console.log(`✅ Call answered successfully: ${callControlId}`);
    }
  } catch (err) {
    console.error("❌ Error answering call:", err);
  }
}

// Telnyx webhook
app.post("/telnyx-stream", async (req, res) => {
  console.log(`\n[${new Date().toISOString()}] Telnyx webhook received:`);
  console.log(JSON.stringify(req.body, null, 2));

  const eventType = req.body.data?.event_type || "UNKNOWN";

  // Try to get callControlId from different possible places
  let callControlId = req.body.data?.call_control_id || req.body.data?.payload?.call_control_id;

  if (!callControlId) {
    console.error("❌ Missing call_control_id in event payload, skipping processing.");
    return res.status(400).send("Missing call_control_id");
  }

  // Strip 'v3:' prefix immediately here if present
  if (callControlId.startsWith("v3:")) {
    callControlId = callControlId.substring(3);
    console.log("🔧 Stripped 'v3:' prefix from callControlId in webhook:", callControlId);
  }

  if (answeredCalls.has(callControlId)) {
    console.log(`⚠️ Call ${callControlId} already answered, skipping.`);
    return res.status(200).send("ok");
  }

  if (eventType === "call.initiated") {
    await answerCall(callControlId);
    answeredCalls.add(callControlId);
    startStreaming(callControlId);
  } else if (eventType === "call.answered") {
    startStreaming(callControlId);
  } else {
    console.log(`ℹ️ Received unhandled event_type: ${eventType}`);
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
