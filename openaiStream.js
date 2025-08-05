// openaiStream.js

const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

console.log("🧠 openaiStream.js loaded");

// Load env vars
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_ASSISTANT_ID || !OPENAI_API_KEY) {
  throw new Error("❌ Missing OPENAI_ASSISTANT_ID or OPENAI_API_KEY in environment variables");
}

let openaiWs;

async function startAIStream(onTranscript, onAudio, onReady) {
  const sessionId = uuidv4(); // unique session ID for each call
  const wsUrl = `wss://api.openai.com/v1/assistants/${OPENAI_ASSISTANT_ID}/rt?session_id=${sessionId}`;

  console.log("🔗 Connecting to OpenAI Realtime WS:", wsUrl);
  console.log("🔐 API Key Prefix:", OPENAI_API_KEY.slice(0, 12));

  try {
    openaiWs = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        Origin: "https://api.openai.com", // Required in some envs
      },
    });

    openaiWs.on("open", () => {
      console.log("🧠 OpenAI WebSocket connected ✅");
      setTimeout(() => {
        if (onReady) onReady();
      }, 100); // slight delay helps with readiness
    });

    openaiWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "transcript" && message.transcript?.text) {
          console.log("📝 Transcript:", message.transcript.text);
          onTranscript(message.transcript.text);
        } else if (message.type === "audio" && message.audio?.data) {
          const audioBuffer = Buffer.from(message.audio.data, "base64");
          onAudio(audioBuffer);
        }
      } catch (err) {
        console.error("⚠️ Error parsing message from OpenAI:", err);
      }
    });

    openaiWs.on("close", () => {
      console.log("❌ OpenAI WebSocket closed");
    });

    openaiWs.on("error", (err) => {
      console.error("⚠️ OpenAI WebSocket error:", err);
    });
  } catch (err) {
    console.error("❌ Failed to start AI stream:", err);
  }
}

function sendAudioToAI(audioBuffer) {
  if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
    openaiWs.send(audioBuffer);
  } else {
    console.warn("🚫 Tried to send audio before WebSocket was open");
  }
}

function closeAIStream() {
  if (openaiWs) openaiWs.close();
}

module.exports = {
  startAIStream,
  sendAudioToAI,
  closeAIStream,
};
