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

// In-memory set to track answered calls
const answeredCalls = new Set();

// Placeholder for starting streaming logic
function startStreaming(callControlId) {
  console.log(`▶️ Starting stream for call_control_id: ${callControlId}`);
  // TODO: Add your stream_start logic here
}

// Answer call via Telnyx API (strip 'v3:' prefix if present)
async function answerCall(callControlId) {
  if (!callControlId) {
    console.warn("⚠️ No callControlId provided to answerCall()");
    return;
  }

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

// Telnyx webhook with full debug and flexible call_control_id extraction
app.post("/telnyx-stream", async (req, res) => {
  console.log(`\n[${new Date().toISOString()}] Telnyx webhook received:`);
  console.log(JSON.stringify(req.body, null, 2));

  const eventType = req.body.data?.event_type || "UNKNOWN";

  // Try to get call_control_id from common places
  let callControlId = req.body.data?.call_control_id || req.body.data?.payload?.call_control_id;

  if (!callControlId) {
    console.error("❌ Missing call_control_id in event payload, skipping processing.");
    return res.status(400).send("Missing call_control_id");
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

// HTTP and WebSocket server setup for Twilio media streaming
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
