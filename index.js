// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { startTranscoder, pipeToTranscoder } = require("./transcoder");
const { startAIStream, sendAudioToAI, closeAIStream } = require("./openaiStream");
const synthesizeAndSend = require("./openaiTTS");
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
  let streamSid = null;

  let transcriptBuffer = "";

  // 🔊 Handle GPT response
  const handleTranscript = async (text) => {
    console.log("📝 Transcript:", text);
    transcriptBuffer += text;

    // Speak after a full sentence or thought
    if (/[.!?]\s*$/.test(transcriptBuffer)) {
      const finalSentence = transcriptBuffer.trim();
      transcriptBuffer = "";
      if (ws.readyState === 1 && streamSid) {
        await synthesizeAndSend(finalSentence, ws, streamSid);
      }
    }
  };

  // 🔁 Transcoder after GPT stream ready
  startAIStream({
    onTranscript: handleTranscript,
    onClose: () => ws.close(),
    onReady: () => console.log("🧠 GPT-4o stream ready")
  });

  // 🔁 Delay FFmpeg startup slightly
  setTimeout(() => {
    startTranscoder((chunk) => {
      if (!transcoderReady) {
        transcoderReady = true;
        console.log("🎙️ Transcoder is now ready");
      }
      if (isStreamAlive) sendAudioToAI(chunk);
    });
  }, 100);

  // 📡 Handle Twilio media stream
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log("🔗 Captured streamSid:", streamSid);
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
      closeAIStream();
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

app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

server.listen(PORT)
  .on("listening", () => console.log(`🚀 Server listening on port ${PORT}`))
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error("❌ Port already in use. Exiting...");
      process.exit(1);
    } else {
      throw err;
    }
  });
