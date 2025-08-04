const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { GoogleAuth } = require("google-auth-library");
const { Transform } = require("stream");
require("dotenv").config();

// 1. ✅ Express app and middleware
const app = express();
app.use(express.urlencoded({ extended: false }));

// 2. ✅ Voice webhook for Twilio
app.post("/twilio/voice", (req, res) => {
  const response = `
    <Response>
      <Say voice="Polly.Joanna">Hi, this is Anna, JP's digital personal assistant. Please start speaking after the beep.</Say>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `;
  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Content-Length", Buffer.byteLength(response));
  res.send(response.trim());
});

// 3. ✅ Create HTTP server
const server = http.createServer(app);

// 4. ✅ WebSocket server
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// 5. ✅ Gemini Streaming Setup
async function setupGeminiStream(ws) {
  try {
    const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const auth = new GoogleAuth({ credentials: creds, scopes: "https://www.googleapis.com/auth/cloud-platform" });
    const genAI = new GoogleGenerativeAI({ authClient: await auth.getClient() });

    const model = genAI.getGenerativeModel({
      model: "gemini-live-2.5-flash-preview-native-audio"
    });

    const convo = model.startAudioConversation({
      generationConfig: {
        temperature: 1,
        maxOutputTokens: 10000,
      }
    });

    console.log("✅ Gemini live stream started.");

    convo.onTextResponse((text) => {
      console.log("🧠 Gemini response:", text.text());
    });

    convo.onAudioResponse((audio) => {
      // Optionally send back audio to Twilio here in future
    });

    convo.onError((err) => {
      console.error("❌ Gemini error:", err);
    });

    // Handle Twilio WebSocket audio packets
    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.event === "start") {
          console.log("🔔 Twilio stream started");
        }

        if (msg.event === "media") {
          const audio = Buffer.from(msg.media.payload, "base64");

          convo.sendAudio({
            audio,
            config: {
              audioEncoding: "MULAW",
              sampleRateHertz: 8000,
              languageCode: "en-AU"
            }
          });
        }

        if (msg.event === "stop") {
          console.log("🔕 Twilio stream stopped");
          convo.stop();
        }
      } catch (e) {
        console.error("💥 Error handling WebSocket message:", e.message);
      }
    });

    ws.on("close", () => {
      console.log("🚪 WebSocket closed");
      convo.stop();
    });
  } catch (err) {
    console.error("❌ Gemini setup error:", err.message);
  }
}

// 6. ✅ Bind Gemini stream to each WebSocket connection
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket connected");
  setupGeminiStream(ws);
});

// 7. ✅ Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
