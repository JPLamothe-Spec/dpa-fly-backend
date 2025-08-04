const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const { connectToOpenAI } = require("./openaiSocket");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Health check
app.get("/", (req, res) => {
  res.status(200).send("Fly.io root OK");
});

// ✅ Twilio webhook GET
app.get("/twilio/voice", (req, res) => {
  res.status(200).send("GET OK");
});

// ✅ Twilio webhook POST
app.post("/twilio/voice", (req, res) => {
  console.log("🎯 Twilio webhook hit");

  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Start>
        <Stream url="wss://dpa-fly-backend-ufegxw.fly.dev/media-stream" track="inbound_track"/>
      </Start>
      <Say voice="alice">Please hold while we connect you.</Say>
      <Pause length="30"/>
    </Response>
  `;

  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml, "utf8"));
  res.status(200).send(twiml.trim());
});

// ✅ HTTP server
const server = http.createServer(app);

// ✅ WebSocket server
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  console.log("🛠 WebSocket upgrade attempt:", request.url);

  socket.on("error", (err) => {
    console.error("💥 WebSocket socket error:", err);
  });

  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, async (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ✅ Handle Twilio → OpenAI audio stream
wss.on("connection", async (twilioWs, request) => {
  console.log("🧩 WebSocket connection established with Twilio");

  const openai = await connectToOpenAI();

  if (!openai) {
    console.error("❌ Failed to connect to OpenAI");
    twilioWs.close();
    return;
  }

  twilioWs.on("message", (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.event === "media" && payload.media?.payload) {
        openai.sendAudio(payload.media.payload); // 🔁 forward base64 audio
      }
    } catch (err) {
      console.error("❌ Failed to process Twilio message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Twilio WebSocket closed");
    openai.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WebSocket error:", err);
    openai.close();
  });
});

// ✅ Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
