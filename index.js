// index.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const synthesizeAndSend = require("./openaiTTS");
const {
  startAIStream,
  sendAudioToAI,
  closeAIStream,
} = require("./openaiStream");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

// ✅ Twilio webhook to start streaming
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="1"/>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

// ✅ HTTP Server + WebSocket handler
const server = http.createServer(app);
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

// ✅ WebSocket connection from Twilio media stream
wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  let currentStreamSid = null;

  const handleTranscript = (text) => {
    console.log("📝 GPT Response:", text);
    synthesizeAndSend(text, ws, currentStreamSid);
  };

  startAIStream(handleTranscript, null, () => {
    console.log("🧠 GPT-4o text stream ready");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "media" && data.media?.payload) {
        if (!currentStreamSid && data.streamSid) {
          currentStreamSid = data.streamSid;
          console.log("🔗 Captured streamSid:", currentStreamSid);
        }
        const audioBuffer = Buffer.from(data.media.payload, "base64");
        sendAudioToAI(audioBuffer);

} else if (data.event === "stop") {
  console.log("⛔ Twilio stream stopped");
  closeAIStream();

  // 🕓 Delay close to allow audio to flush
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }, 2000); // 2s buffer – you can fine-tune this
}

    } catch (err) {
      console.error("❌ WebSocket message error:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    closeAIStream();
  });
});

// ✅ Health check route for Fly.io
app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

// ✅ Start HTTP server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
