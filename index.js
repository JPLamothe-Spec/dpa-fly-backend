// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const { connectToGemini } = require("./geminiStream");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Health check route
app.get("/", (req, res) => res.status(200).send("OK"));

// ✅ Twilio webhook
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ WebSocket server for Twilio Media Stream
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", async (twilioWs) => {
  console.log("✅ WebSocket connection from Twilio established");

  // Connect to Gemini
  const gemini = await connectToGemini(
    (audio) => {
      // TODO: Send audio back to Twilio when two-way audio is supported
      // twilioWs.send(...)
    },
    (transcript) => {
      console.log("📝 Transcript:", transcript);
    }
  );

  twilioWs.on("message", (msg) => {
    try {
      const message = JSON.parse(msg);
      if (message.event === "media" && message.media?.payload) {
        const audioData = Buffer.from(message.media.payload, "base64");
        gemini.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=8000",
                data: message.media.payload
              }
            ]
          }
        }));
      }
    } catch (err) {
      console.error("Error handling Twilio message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ WebSocket from Twilio closed");
    gemini.close();
  });
});

server.on("upgrade", (req, socket, head) => {
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
