// index.js
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const {
  startAIStream,
  sendAudioToAI,
  closeAIStream
} = require("./openaiStream");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const server = app.listen(3000, () => {
  console.log("🚀 Server listening on port 3000");
});

const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
      <Pause length="30"/>
    </Response>
  `;
  res.set("Content-Type", "text/xml");
  res.set("Content-Length", Buffer.byteLength(twiml));
  res.send(twiml);
});

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  const connectionId = uuidv4();
  let aiStream = null;

  function handleTwilioStream(ws, connectionId) {
    aiStream = startAIStream({
      onTranscript: async (transcript) => {
        console.log("📝 Transcript:", transcript);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              event: "ai-response",
              streamSid: connectionId,
              text: transcript
            })
          );
        } else {
          console.log("⚠️ TTS skipped – WebSocket already closed");
        }
      },
      onClose: () => {
        console.log("❌ OpenAI stream ended");
      },
      onReady: () => {
        console.log("🎤 AI stream ready");
      }
    });
  }

  handleTwilioStream(ws, connectionId);

  ws.on("message", (message) => {
    const parsed = JSON.parse(message);
    if (parsed.event === "start") {
      console.log("🟢 Twilio stream started");
    } else if (parsed.event === "media" && parsed.media?.payload) {
      const audioBuffer = Buffer.from(parsed.media.payload, "base64");
      sendAudioToAI(audioBuffer);
    } else if (parsed.event === "stop") {
      console.log("⛔ Twilio stream stopped");
      closeAIStream();
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket connection closed");
    closeAIStream();
  });
});
