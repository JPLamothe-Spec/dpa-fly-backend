// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { startTranscoder, pipeToTranscoder } = require("./transcoder");
const { startAIStream, sendAudioToAI } = require("./openaiStream");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

app.post("/twilio/voice", (req, res) => {
  const streamUrl = `wss://${req.headers.host}/media-stream`;
  const twiml = `
    <Response>
      <Start>
        <Stream url="${streamUrl}" track="inbound_track"/>
      </Start>
      <Pause length="30"/>
    </Response>
  `;
  res.type("text/xml").send(twiml.trim());
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  let isStreamAlive = true;
  let transcoderReady = false;

  // 🔁 First start transcoder
  startTranscoder((chunk) => {
    if (!transcoderReady) {
      transcoderReady = true;
      console.log("🎙️ Transcoder is now ready");
    }
    if (isStreamAlive) sendAudioToAI(chunk);
  });

  // 🧠 Then start GPT stream
  startAIStream({
    onTranscript: (text) => {
      console.log("📝 Transcript:", text);
    },
    onClose: () => {
      ws.close();
    },
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.event === "start") {
      console.log("🔗 Captured streamSid:", data.start.streamSid);
    } else if (data.event === "media") {
      if (transcoderReady) {
        const audio = Buffer.from(data.media.payload, "base64");
        pipeToTranscoder(audio);
      } else {
        console.log("⚠️ Audio skipped — transcoder not ready yet");
      }
    } else if (data.event === "stop") {
      console.log("⛔ Twilio stream stopped");
      isStreamAlive = false;
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
