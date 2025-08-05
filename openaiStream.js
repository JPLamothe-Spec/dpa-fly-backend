// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");

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

    // ✅ Send initial config only — no `contents`
    ws.send(
      JSON.stringify({
        system_instruction: {
          role: "system",
          parts: [
            {
              text: "You are Anna, JP's helpful digital personal assistant. Speak clearly and naturally."
            },
          ],
        },
        config: {
          audio_config: {
            audio_encoding: "MULAW",
            sample_rate_hertz: 8000,
            language_code: "en-US",
          },
          response_config: {
            response_type: "AUDIO",
            audio_encoding: "MULAW",
            sample_rate_hertz: 8000,
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          audio: {
            audio: base64Audio,
          },
        })
      );
    } else {
      console.warn("🚫 Tried to stream audio but Gemini WebSocket was not open");
    }
  };

  const closeStream = () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  return { streamAudio, closeStream };
}

module.exports = { startGeminiStream };

