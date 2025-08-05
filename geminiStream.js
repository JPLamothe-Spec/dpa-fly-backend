// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");

// ✅ Gemini model with audio input/output
const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-preview-native-audio:streamGenerateContent";

async function startGeminiStream(onTranscriptCallback) {
  // ✅ Parse credentials from Fly secret string
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  const auth = new GoogleAuth({
    credentials, // ✅ Pass parsed credentials directly
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const headers = {
    Authorization: `Bearer ${token.token}`,
    "Content-Type": "application/json",
  };

  const ws = new WebSocket(GEMINI_WS_URL, { headers });

  ws.on("open", () => {
    console.log("🧠 Gemini WebSocket connection established");

    ws.send(
      JSON.stringify({
        config: {
          audioConfig: {
            audioEncoding: "MULAW",
            sampleRateHertz: 8000,
            languageCode: "en-US",
          },
          text: {
            context: "You are Anna, a friendly, intelligent digital personal assistant helping JP handle calls.",
          },
        },
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());

      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log("🗣️ Gemini Transcript:", text);
        if (onTranscriptCallback) onTranscriptCallback(text);
      }
    } catch (err) {
      console.error("❌ Error parsing Gemini message:", err);
    }
  });

  ws.on("close", () => {
    console.log("🧠 Gemini WebSocket closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ Gemini WebSocket error:", err);
  });

  const streamAudio = (base64Audio) => {
    ws.send(
      JSON.stringify({
        audio: {
          audio: base64Audio,
        },
      })
    );
  };

  return { streamAudio };
}

module.exports = { startGeminiStream };
