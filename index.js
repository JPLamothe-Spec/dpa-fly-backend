// index.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
require("dotenv").config();

const {
  startAIStream,
  sendAudioToAI,
  closeAIStream,
} = require("./openaiStream");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Twilio webhook endpoint for incoming calls
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

// ✅ Create HTTP server and bind WebSocket upgrade
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

// ✅ Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  const handleTranscript = (text) => {
    console.log("📝 Transcript:", text);
  };

  const handleAudioResponse = (audioBuffer) => {
    const response = {
      event: "media",
      media: {
        payload: audioBuffer.toString("base64"),
      },
    };
    ws.send(JSON.stringify(response));
  };

  startAIStream(handleTranscript, handleAudioResponse, () => {
    console.log("🧠 GPT‑4o stream ready");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === "media" && data.media?.payload) {
        const audioBuffer = Buffer.from(data.media.payload, "base64");
        sendAudioToAI(audioBuffer);
      } else if (data.event === "stop") {
        console.log("⛔ Twilio stream stopped");
        closeAIStream();
        ws.close();
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

// ✅ Health check route
app.get("/", (req, res) => {
  res.status(200).send("DPA backend is running");
});

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
