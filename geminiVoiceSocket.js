// geminivoicesocket.js

const WebSocket = require("ws");
const fs = require("fs");
const { GoogleAuth } = require("google-auth-library");

const GEMINI_MODEL = "gemini-live-2.5-flash-preview-native-audio";
const GEMINI_ENDPOINT = `wss://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

async function connectToGemini(onResponse) {
  // Write service account JSON to temp file (used by google-auth-library)
  const credsPath = "/tmp/gemini-service-account-key.json";
  fs.writeFileSync(credsPath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const ws = new WebSocket(GEMINI_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  ws.on("open", () => {
    console.log("🎙️ Connected to Gemini Live API");

    ws.send(
      JSON.stringify({
        config: {
          audioConfig: {
            audioEncoding: "LINEAR16",
            sampleRateHertz: 8000,
            languageCode: "en-US",
          },
          responseConfig: {
            responseType: "AUDIO",
            audioEncoding: "MULAW",
            sampleRateHertz: 8000,
          },
        },
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.audio) {
        onResponse(Buffer.from(msg.audio, "base64")); // 🔈 Raw audio reply
      } else if (msg.transcript) {
        console.log("📝 Transcript:", msg.transcript);
      } else {
        console.log("📨 Gemini event:", msg);
      }
    } catch (err) {
      console.error("❌ Failed to parse Gemini message:", err);
    }
  });

  ws.on("close", () => console.log("🔌 Gemini WebSocket closed"));
  ws.on("error", (err) => console.error("❌ Gemini WebSocket error:", err));

  return ws;
}

module.exports = { connectToGemini };

