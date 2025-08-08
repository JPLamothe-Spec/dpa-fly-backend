// index.js

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const { startAIStream, sendAudioToAI, commitAudioToAI, closeAIStream } = require("./openaiStream");
const { synthesizeAndSend } = require("./openaiTTS");

const app = express();
const PORT = process.env.PORT || 3000;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.error("⚠️ Missing TELNYX_API_KEY environment variable");
  process.exit(1);
}

app.use(bodyParser.json());

// Track answered calls
const answeredCalls = new Set();

// Store active GPT stream and Twilio WS per call
const activeCalls = new Map();

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

function startStreaming(callControlId) {
  console.log(`▶️ Starting GPT stream for call_control_id: ${callControlId}`);

  startAIStream({
    onTranscript: async (partial) => {
      console.log(`📝 GPT Transcript partial: ${partial.text || partial}`);
      // Example: send partial transcript as TTS back to caller
      const callData = activeCalls.get(callControlId);
      if (callData?.ws) {
        await synthesizeAndSend(partial.text || partial, callData.ws, callControlId);
      }
    },
    onClose: () => {
      console.log(`❌ GPT stream closed for call_control_id: ${callControlId}`);
      activeCalls.delete(callControlId);
    },
    onReady: () => {
      console.log(`✅ GPT stream ready for call_control_id: ${callControlId}`);
    }
  });
}

// Telnyx webhook to handle call events
app.post("/telnyx-stream", async (req, res) => {
  const eventType = req.body.data?.event_type || "UNKNOWN";
  let callControlId = req.body.data?.call_control_id;

  console.log(`[${new Date().toISOString()}] Telnyx event received: ${eventType}`);

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

wss.on("connection", (ws, request) => {
  console.log("✅ Twilio WebSocket connection established");

  // Extract callControlId from query or headers if possible (optional)
  // For this example, we won't bind ws to a callControlId automatically

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.event === "media" && msg.media?.payload) {
        const audioBuffer = Buffer.from(msg.media.payload, "base64");

        // For demo, just log length and forward to GPT if active
        console.log(`📨 Received audio chunk: ${audioBuffer.length} bytes`);

        // Forward to GPT stream for all active calls (simplification)
        for (const [callControlId, callData] of activeCalls) {
          sendAudioToAI(audioBuffer);
        }
      }
    } catch (err) {
      console.error("⚠️ Error processing WebSocket message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ Twilio WebSocket error:", err);
  });

  // Store ws somewhere if needed (for sending TTS back)
  // For demo purposes, skipping call linking here
});

app.get("/", (req, res) => {
  res.status(200).send("DPA backend is live");
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
