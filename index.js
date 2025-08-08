// index.js (Telnyx WebSocket Version)
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const { startAIStream, sendAudioToAI, closeAIStream } = require("./openaiStream");
const { synthesizeAndSend } = require("./openaiTTS");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = process.env.PORT || 3000;

// Root health check
app.get("/", (req, res) => res.status(200).send("DPA backend (Telnyx) is live"));

// Handle Telnyx WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/telnyx-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  console.log(`[${new Date().toISOString()}] ✅ Telnyx WebSocket connected`);

  let transcriptBuffer = "";
  let lastFlushTime = Date.now();
  let streamId = null;

  // Handle GPT transcript output
  const handleTranscript = async (text) => {
    console.log(`[${new Date().toISOString()}] 📝 Transcript:`, text);
    transcriptBuffer += text;
    const now = Date.now();

    const isFinalPunctuation = /[.!?]\s*$/.test(transcriptBuffer);
    const isFlushDue = now - lastFlushTime > 1000 && transcriptBuffer.trim().length > 5;

    if (isFinalPunctuation || isFlushDue) {
      const finalSentence = transcriptBuffer.trim();
      transcriptBuffer = "";
      lastFlushTime = now;

      if (ws.readyState === WebSocket.OPEN) {
        if (!streamId) {
          console.warn(`[${new Date().toISOString()}] ⚠️ synthesizeAndSend skipped — streamId not yet captured`);
        } else {
          console.log(`[${new Date().toISOString()}] 📣 Sending TTS:`, finalSentence);
          await synthesizeAndSend(finalSentence, ws, streamId);
        }
      } else {
        console.warn(`[${new Date().toISOString()}] ⚠️ TTS skipped – WebSocket already closed`);
      }
    }
  };

  // Start GPT stream
  startAIStream({
    onTranscript: handleTranscript,
    onClose: () => ws.close(),
    onReady: () => console.log(`[${new Date().toISOString()}] 🧠 GPT stream ready`)
  });

  // Handle Telnyx audio + events
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error(`[${new Date().toISOString()}] ⚠️ Non-JSON message from Telnyx`);
      return;
    }

    if (data.event === "connected") {
      console.log(`[${new Date().toISOString()}] 🔗 Telnyx call connected`);
    } 
    else if (data.event === "start") {
      streamId = data.stream_id || data.call_id || null;
      console.log(`[${new Date().toISOString()}] 🔗 Captured Telnyx streamId:`, streamId);
    } 
    else if (data.event === "media" && data.media?.payload) {
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      sendAudioToAI(audioBuffer); // Already 16kHz PCM — no transcoder
    } 
    else if (data.event === "stop") {
      console.log(`[${new Date().toISOString()}] ⛔ Telnyx stream stopped`);
      closeAIStream();
    }
  });

  ws.on("close", () => {
    console.log(`[${new Date().toISOString()}] ❌ Telnyx WebSocket closed`);
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] ⚠️ Telnyx WebSocket error:`, err);
    closeAIStream();
  });
});

// Start server
server.listen(PORT)
  .on("listening", () => {
    console.log(`[${new Date().toISOString()}] 🚀 Telnyx DPA backend listening on port ${PORT}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[${new Date().toISOString()}] ❌ Port already in use. Exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  });

