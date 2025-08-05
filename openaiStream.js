// openaiStream.js

const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let openaiWs;

async function startAIStream(onTranscript, onAudio, onReady) {
  const sessionId = uuidv4(); // unique session ID for each call

  const wsUrl = `wss://api.openai.com/v1/assistants/${OPENAI_ASSISTANT_ID}/rt?session_id=${sessionId}`;
  console.log("🔗 Connecting to:", wsUrl);
  console.log("🔐 Using key starting with:", OPENAI_API_KEY.slice(0, 15));

  openaiWs = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      Origin: "https://api.openai.com", // ✅ Required in some environments
    },
  });

  openaiWs.on("open", () => {
    console.log("🧠 OpenAI WebSocket connected ✅");
    if (onReady) {
      // Optional small delay before onReady to ensure connection is truly stable
      setTimeout(() => onReady(), 100);
    }
  });

  openaiWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "transcript" && message.transcript?.text) {
        onTranscript(message.transcript.text);
      } else if (message.type === "audio" && message.audio?.data) {
        const audioBuffer = Buffer.from(message.audio.data, "base64");
        onAudio(audioBuffer);
      }
    } catch (err) {
      console.error("⚠️ Error parsing OpenAI message:", err);
    }
  });

  openaiWs.on("close", () => {
    console.log("❌ OpenAI WebSocket closed");
  });

  openaiWs.on("error", (err) => {
    console.error("⚠️ OpenAI WebSocket error:", err);
  });
}

function sendAudioToAI(audioBuffer) {
  if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
    openaiWs.send(audioBuffer);
  } else {
    console.warn("🚫 Tried to send audio before WebSocket was ready");
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
