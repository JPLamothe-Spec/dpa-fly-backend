const WebSocket = require("ws");

const ASSISTANT_ID = process.env.ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const OPENAI_URL = `wss://api.openai.com/v1/assistants/${ASSISTANT_ID}/rt`;

function connectToOpenAI() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OPENAI_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });

    ws.on("open", () => {
      console.log("🧠 OpenAI WebSocket connected");

      resolve({
        sendAudio: (base64Audio) => {
          const payload = {
            type: "audio",
            audio: base64Audio,
          };
          ws.send(JSON.stringify(payload));
        },
        close: () => {
          ws.close();
        },
      });
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "transcript") {
          console.log(`📝 Transcript: ${message.transcript}`);
        } else if (message.type === "message_created") {
          const text = message.message?.content?.[0]?.text?.value;
          if (text) {
            console.log(`🤖 Assistant says: ${text}`);
          }
        } else {
          console.log("📨 OpenAI message:", message);
        }
      } catch (err) {
        console.error("⚠️ Failed to parse OpenAI message:", err);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`🔌 OpenAI WebSocket closed. Code: ${code}, Reason: ${reason}`);
    });

    ws.on("error", (err) => {
      console.error("❌ OpenAI WebSocket error:", err.message);
      reject(err);
    });
  }).catch((err) => {
    console.error("🚨 Failed to connect to OpenAI:", err);
    return null;
  });
}

module.exports = { connectToOpenAI };
