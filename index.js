const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const { connectToGemini } = require("./geminivoicesocket");
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
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Say voice="alice">Please hold while I connect you.</Say>
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

// ✅ Handle Twilio → Gemini voice stream
wss.on("connection", async (twilioWs, request) => {
  console.log("🔗 Twilio WebSocket connected");

  const geminiWs = await connectToGemini((audioChunk) => {
    if (twilioWs.readyState === WebSocket.OPEN) {
      const message = {
        event: "media",
        media: {
          payload: audioChunk.toString("base64"),
        },
      };
      twilioWs.send(JSON.stringify(message));
    }
  });

  twilioWs.on("message", (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.event === "media" && payload.media?.payload) {
        geminiWs.send(
          JSON.stringify({
            audio: payload.media.payload,
          })
        );
      }
    } catch (err) {
      console.error("❌ Failed to process Twilio message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Twilio WebSocket closed");
    geminiWs.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WebSocket error:", err);
    geminiWs.close();
  });
});

// ✅ Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
