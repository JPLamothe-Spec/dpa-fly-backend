// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");

let GEMINI_WS_URL = "wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-001:streamGenerateContent?alt=sse";

async function startGeminiStream(onTranscriptCallback) {
  // Get a fresh OAuth 2.0 token using your service account
  const auth = new GoogleAuth({
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

    // Send initial message to configure the assistant
    ws.send(
      JSON.stringify({
        config: {
          text: {
            context: "You are Anna, a friendly, intelligent digital personal assistant helping JP handle calls.",
          },
        },
      })
    );
  });

  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString());

    if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
      const transcript = parsed.candidates[0].content.parts[0].text;
      console.log("🗣️ Gemini Transcript:", transcript);
      if (onTranscriptCallback) {
        onTranscriptCallback(transcript);
      }
    }
  });

  ws.on("close", () => {
    console.log("🧠 Gemini WebSocket closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ Gemini WebSocket error:", err);
  });

  // Return a function to stream audio to Gemini
  const streamAudio = (base64Audio) => {
    ws.send(
      JSON.stringify({
        audio: {
          config: {
            audioEncoding: "MULAW",
            sampleRateHertz: 8000,
            languageCode: "en-US",
          },
          audio: base64Audio,
        },
      })
    );
  };

  return { streamAudio };
}

module.exports = { startGeminiStream };
