// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");

// ✅ Gemini endpoint for native audio
const GEMINI_WS_URL =
  "wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-preview-native-audio:streamGenerateContent";

async function startGeminiStream(onTranscriptCallback) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  const auth = new GoogleAuth({
    credentials,
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
    console.log("🧠 Gemini WebSocket connection established ✅");

    // Send initial config
    ws.send(
      JSON.stringify({
        config: {
          audioConfig: {
            audioEncoding: "MULAW",
            sampleRateHertz: 8000,
            languageCode: "en-US",
          },
          text: {
            context: "You are Anna, JP's helpful digital personal assistant. You’re listening to the caller and will respond naturally.",
          },
        },
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      // ✅ Check for transcript in typical Gemini format
      const text = message.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log("🗣️ Gemini Transcript:", text);
        if (onTranscriptCallback) onTranscriptCallback(text);
      } else {
        console.log("📥 Gemini message (no text):", JSON.stringify(message));
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

  // 🎙️ Stream audio into Gemini
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
