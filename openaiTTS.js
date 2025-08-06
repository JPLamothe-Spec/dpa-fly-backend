// openaiTTS.js

const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

// Voice: Breeze is friendly + slightly Aussie
const VOICE = "echo"; // Options: alloy, echo, fable, onyx, nova, shimmer
const MODEL = "tts-1"; // Or use "tts-1-hd" for higher fidelity

/**
 * Synthesizes speech from text using OpenAI's TTS API and sends to Twilio WebSocket
 * @param {string} text - The text to synthesize
 * @param {WebSocket} ws - The Twilio media WebSocket
 */
async function synthesizeAndSend(text, ws) {
  try {
    if (!ws || ws.readyState !== 1) {
      console.warn("⚠️ WebSocket not open – cannot send audio");
      return;
    }

    console.log("🎤 Synthesizing:", text);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice: VOICE,
        response_format: "pcm",         // Required for Twilio media
        speed: 1.0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ TTS API error:", errorText);
      return;
    }

    const reader = response.body.getReader();
    let audioBuffer = Buffer.alloc(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) audioBuffer = Buffer.concat([audioBuffer, Buffer.from(value)]);
    }

    if (!audioBuffer.length) {
      console.warn("⚠️ No audio buffer received");
      return;
    }

    const mediaMessage = {
      event: "media",
      streamSid: uuidv4(), // Twilio expects a unique streamSid for each audio chunk
      media: {
        payload: audioBuffer.toString("base64")
      }
    };

    ws.send(JSON.stringify(mediaMessage));
    console.log("📤 TTS audio sent to Twilio:", text);

  } catch (err) {
    console.error("❌ TTS error:", err);
  }
}

module.exports = { synthesizeAndSend };

