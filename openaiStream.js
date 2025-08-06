// openaiStream.js

const https = require("https");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openaiRequest;
let partialBuffer = "";

function startAIStream({ onTranscript, onClose, onReady }) {
  const sessionId = uuidv4();

  const requestPayload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are Anna, JP's friendly Australian digital assistant. Speak naturally and keep responses short and conversational."
      }
    ],
    stream: true,
    max_tokens: 256,
    temperature: 0.7
  };

  const req = https.request(
    {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    },
    (res) => {
      res.on("data", (chunk) => {
        partialBuffer += chunk.toString();
        const parts = partialBuffer.split("\n\n");
        partialBuffer = parts.pop();

        for (const part of parts) {
          if (!part || !part.startsWith("data:")) continue;

          const jsonPart = part.replace(/^data:\s*/, "");
          if (jsonPart === "[DONE]") {
            console.log("✅ OpenAI stream complete");
            closeAIStream();
            return;
          }

          try {
            const parsed = JSON.parse(jsonPart);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content && onTranscript) {
              onTranscript(content);
            }
          } catch (err) {
            console.error("⚠️ Error parsing OpenAI stream chunk:", err);
          }
        }
      });

      res.on("end", () => {
        console.log("❌ OpenAI stream ended");
        if (onClose) onClose();
      });
    }
  );

  req.on("error", (err) => {
    console.error("❌ OpenAI stream error:", err);
    if (onClose) onClose();
  });

  req.write(JSON.stringify(requestPayload));
  req.flushHeaders?.();
  openaiRequest = req;

  if (onReady) onReady();
}

function sendAudioToAI(audioBuffer) {
  // GPT-4o chat completions doesn’t accept real-time audio input yet
}

function closeAIStream() {
  if (openaiRequest) {
    openaiRequest.end();
    openaiRequest = null;
  }
}

module.exports = {
  startAIStream,
  sendAudioToAI,
  closeAIStream
};
