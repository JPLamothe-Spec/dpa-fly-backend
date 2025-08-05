// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");
const { PassThrough } = require("stream");

const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-preview-1:streamGenerateContent";

let geminiWs;

async function startGeminiStream(onTranscript, onAudio, onReady) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new GoogleAuth({
    credentials,
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  geminiWs = new WebSocket(`${GEMINI_WS_URL}?alt=speech`, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  geminiWs.on("open", () => {
    console.log("🧠 Gemini WebSocket connection established ✅");
    onReady();
  });

  geminiWs.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.recognitionResult) {
      const transcript = message.recognitionResult.transcript;
      if (transcript && transcript.length > 0) {
        onTranscript(transcript);
      }
    } else if (message.audioResponse) {
      const audioBuffer = Buffer.from(message.audioResponse.audio, "base64");
      onAudio(audioBuffer);
    }
  });

  geminiWs.on("close", () => {
    console.log("❌ Gemini WebSocket connection closed");
  });

  geminiWs.on("error", (err) => {
    console.error("⚠️ Gemini WebSocket error:", err);
  });
}

function sendAudioToGemini(audioBuffer) {
  if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
    geminiWs.send(audioBuffer);
  }
}

function closeGeminiStream() {
  if (geminiWs) geminiWs.close();
}

module.exports = {
  startGeminiStream,
  sendAudioToGemini,
  closeGeminiStream,
};

