// openaiStream.js

const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let openaiWs;

async function startAIStream(onTranscript, onAudio, onReady) {
  const sessionId = uuidv4(); // unique ID per call

  openaiWs = new WebSocket(
    `wss://api.openai.com/v1/assistants/${OPENAI_ASSISTANT_ID}/rt?session_id=${sessionId}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  );

  openaiWs.on("open", () => {
    console.log("🧠 OpenAI WebSocket connected ✅");
    if (onReady) onReady();
  });

  openaiWs.on("message", (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === "transcript" && message.transcript?.text) {
      onTranscript(message.transcript.text);
    } else if (message.type === "audio" && message.audio?.data) {
      const audioBuffer = Buffer.from(message.audio.data, "base64");
      onAudio(audioBuffer);
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
