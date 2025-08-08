// index.js

const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use JSON parser for Telnyx webhook
app.use(bodyParser.json());

// Toggle for starting stream on call.initiated (for testing)
const startStreamOnInitiated = process.env.START_STREAM_ON_INITIATED === "true";

// Placeholder function for your actual stream start logic
function startStreaming(callControlId) {
  console.log(`▶️ Starting stream for call_control_id: ${callControlId}`);
  // TODO: Insert your actual stream_start API call or streaming logic here
}

// Telnyx webhook: log all events and optionally start streaming
app.post("/telnyx-stream", (req, res) => {
  const eventType = req.body.data?.event_type || "UNKNOWN";
  const callControlId = req.body.data?.call_control_id || "UNKNOWN";

  console.log(`[${new Date().toISOString()}] Telnyx event received: ${eventType}`);
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  if (startStreamOnInitiated && eventType === "call.initiated") {
    startStreaming(callControlId);
  } else if (!startStreamOnInitiated && eventType === "call.answered") {
    startStreaming(callControlId);
  }

  res.status(200).send("ok");
});

// Twilio webhook to start media streaming
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

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server with noServer option (manual upgrade)
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrades
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (message) => {
    // TODO: Handle incoming audio chunks here
    // For now just log message length to confirm streaming
    console.log(`📨 Media Stream Message: ${message.length} bytes`);
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

// Health check route
app.get("/", (req, res) => {
  res.status(200).send("DPA backend is live");
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
