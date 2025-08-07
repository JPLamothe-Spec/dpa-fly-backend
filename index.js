// index.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { startTranscoder, pipeToTranscoder } = require("./transcoder");
const { startAIStream, sendAudioToAI, closeAIStream } = require("./openaiStream");
const { synthesizeAndSend } = require("./openaiTTS");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = process.env.PORT || 3000;

app.post("/twilio/voice", (req, res) => {
  const streamUrl = `wss://${req.headers.host}/media-stream`;
  const twiml = `
    <Response>
      <Say voice="alice">...</Say>
      <Start>
        <Stream url="${streamUrl}" track="inbound_track"/>
      </Start>
      <Pause length="60"/>
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
  console.log(`[${new Date().toISOString()}] ✅ WebSocket connection established`);

  let isStreamAlive = true;
  let transcoderReady = false;
  let streamSid = null;
  let transcriptBuffer = "";

  // 🔊 Handle GPT response
  const handleTranscript = async (text) => {
    console.log(`[${new Date().toISOString()}] 📝 Transcript:`, text);
    transcriptBuffer += text;

    if (/[.!?]\s*$/.test(transcriptBuffer)) {
      const finalSentence = transcriptBuffer.trim();
      transcriptBuffer = "";

      if (ws.readyState === 1) {
        if (!streamSid) {
          console.warn(`[${new Date().toISOString()}] ⚠️ synthesizeAndSend skipped — streamSid not yet captured`);
        } else {
          console.log(`[${new Date().toISOString()}] 📣 Calling synthesizeAndSend:`, finalSentence);
          await synthesizeAndSend(finalSentence, ws, streamSid);
        }
      } else {
        console.warn(`[${new Date().toISOString()}] ⚠️ TTS skipped – WebSocket already closed`);
      }
    }
  };

  // ✅ Start GPT stream
  startAIStream({
    onTranscript: handleTranscript,
    onClose: () => ws.close(),
    onReady: () => console.log(`[${new Date().toISOString()}] 🧠 GPT-4o stream ready`)
  });

  // ✅ Start transcoder immediately (no delay)
  startTranscoder((chunk) => {
    if (!transcoderReady) {
      transcoderReady = true;
      console.log(`[${new Date().toISOString()}] 🎙️ Transcoder is now ready`);
    }
    if (isStreamAlive) {
      console.log(`[${new Date().toISOString()}] 🎧 Sending audio to GPT`);
      sendAudioToAI(chunk);
    }
  });

  // 📡 Handle Twilio media stream
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      streamSid = data.start.streamSid;
      console.log(`[${new Date().toISOString()}] 🔗 Captured streamSid:`, streamSid);
    } else if (data.event === "media") {
      if (transcoderReady) {
        const audio = Buffer.from(data.media.payload, "base64");
        pipeToTranscoder(audio);
      } else {
        console.log(`[${new Date().toISOString()}] ⚠️ Audio skipped — transcoder not ready yet`);
      }
    } else if (data.event === "stop") {
      console.log(`[${new Date().toISOString()}] ⛔ Twilio stream stopped`);
      isStreamAlive = false;
      closeAIStream();
    }
  });

  ws.on("close", () => {
    console.log(`[${new Date().toISOString()}] ❌ WebSocket connection closed`);
    closeAIStream();
  });

  ws.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] ⚠️ WebSocket error:`, err);
    closeAIStream();
  });
});

app.get("/", (req, res) => res.status(200).send("DPA backend is live"));

server.listen(PORT)
  .on("listening", () => console.log(`[${new Date().toISOString()}] 🚀 Server listening on port ${PORT}`))
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[${new Date().toISOString()}] ❌ Port already in use. Exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  });
