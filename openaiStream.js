// openaiStream.js
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// WebSocket connection to GPT
let gptWs = null;

function startAIStream({ onTranscript, onClose, onReady }) {
  const sessionId = uuidv4();
  const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12&voice=alloy`;

  console.log(`[${new Date().toISOString()}] 🔌 Connecting to OpenAI Realtime API...`);

  gptWs = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  gptWs.on("open", () => {
    console.log(`[${new Date().toISOString()}] ✅ GPT Realtime connection established (session: ${sessionId})`);
    if (onReady) onReady();
  });

  gptWs.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "transcript.delta" && msg.delta) {
        // Live transcript partial
        if (onTranscript) onTranscript(msg.delta);
      }

      if (msg.type === "transcript.completed") {
        console.log(`[${new Date().toISOString()}] 📝 Final transcript:`, msg.transcript);
      }

      if (msg.type === "response.completed") {
        console.log(`[${new Date().toISOString()}] ✅ GPT finished speaking`);
      }
    } catch (err) {
      console.error("⚠️ Error parsing GPT message:", err);
    }
  });

  gptWs.on("close", () => {
    console.log(`[${new Date().toISOString()}] ❌ GPT WebSocket closed`);
    if (onClose) onClose();
  });

  gptWs.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] ❌ GPT WebSocket error:`, err);
    if (onClose) onClose();
  });
}

// Send Telnyx PCM audio directly to GPT
function sendAudioToAI(audioBuffer) {
  if (!gptWs || gptWs.readyState !== WebSocket.OPEN) {
    console.warn("⚠️ Cannot send audio — GPT WebSocket not open");
    return;
  }

  // Send raw PCM audio frame
  gptWs.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: audioBuffer.toString("base64")
  }));
}

// Tell GPT to start processing current audio buffer
function commitAudioToAI() {
  if (gptWs && gptWs.readyState === WebSocket.OPEN) {
    gptWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    gptWs.send(JSON.stringify({ type: "response.create" }));
  }
}

// Close GPT connection
function closeAIStream() {
  if (gptWs) {
    gptWs.close();
    gptWs = null;
  }
}

module.exports = {
  startAIStream,
  sendAudioToAI,
  commitAudioToAI,
  closeAIStream
};

