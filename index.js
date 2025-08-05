// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const { startGeminiStream } = require("./geminiStream");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Health check route
app.get("/", (req, res) => res.status(200).send("OK"));

// ✅ Twilio webhook route for incoming calls
app.post("/twilio/voice", (req, res) => {
  console.log("📞 Twilio webhook hit");
  console.log("📩 Twilio headers:", req.headers); // ✅ New line for diagnostics

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" />
      </Start>
    </Response>
  `.trim();

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server for Twilio Media Stream
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", async (twilioWs) => {
  console.log("✅ WebSocket connection from Twilio established");

  let gemini;

  try {
    const { streamAudio } = await startGeminiStream((transcript) => {
      console.log("📝 Transcript from Gemini:", transcript);
    });

    gemini = { streamAudio };

    twilioWs.on("message", (msg) => {
      try {
        const message = JSON.parse(msg);
        if (message.event === "media" && message.media?.payload) {
          const base64Audio = message.media.payload;
          gemini.streamAudio(base64Audio);
        } else if (message.event === "start") {
          console.log("🔔 Twilio stream started");
        }
      } catch (err) {
        console.error("❌ Error handling Twilio message:", err);
      }
    });

    twilioWs.on("close", () => {
      console.log("❌ WebSocket from Twilio closed");
    });

  } catch (err) {
    console.error("❌ Failed to start Gemini stream:", err);
  }
});

// ✅ WebSocket upgrade route
server.on("upgrade", (req, socket, head) => {
  console.log("🔁 WebSocket upgrade request to:", req.url);
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
