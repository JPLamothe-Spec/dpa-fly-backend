// geminiStream.js

const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");

// ✅ Gemini config using JP's project
const PROJECT_ID = "ai-voice-caller-id";
const LOCATION = "us-central1"; // Change to "europe-west4" if needed

// ✅ Vertex AI Gemini 2.0 streaming endpoint
const GEMINI_WS_URL = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

async function startGeminiStream(onTranscriptCallback) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const headers = {
    Authorization: `Bearer ${token.token}`,
  };

  const ws = new WebSocket(GEMINI_WS_URL, { headers });

  ws.on("open", () => {
    console.log("🧠 Gemini WebSocket connection established ✅");

    // ✅ Initial setup payload for Gemini 2.0 Flash
    ws.send(
      JSON.stringify({
        setup: {
          model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash`,
          generationConfig: {
            responseModalities: ["text"],
            audioConfig: {
              samplingRate: 8000,
              audioEncoding: "MULAW",
            },
          },
          systemInstruction: {
            parts: [
              {
                text: "You are Anna, JP's friendly digital assistant answering phone calls."
              }
            ]
          }
        }
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.candidates?.length) {
        const text = message.candidates[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log("🧠 Gemini Transcript:", text);
          if (onTranscriptCallback) onTranscriptCallback(text);
        }
      } else {
        console.log("📨 Gemini Event:", message);
      }
    } catch (err) {
      console.error("❌ Failed to parse Gemini response:", err);
    }
  });

  ws.on("error", (err) => {
    console.error("⚠️ Gemini WebSocket error:", err);
  });

  ws.on("close", () => {
    console.log("🧠 Gemini WebSocket closed");
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
