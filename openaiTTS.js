// openaiTTS.js
const fetch = require("node-fetch");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const stream = require("stream");
const { promisify } = require("util");

ffmpeg.setFfmpegPath(ffmpegPath);
const pipeline = promisify(stream.pipeline);

const synthesizeAndSend = async (text, twilioWs, streamSid) => {
  try {
    console.log("🎤 Synthesizing:", text);

    // Step 1: Call OpenAI TTS API to get MP3
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova", // Or alloy, shimmer, onyx, echo
        input: text
      })
    });

    if (!ttsRes.ok) throw new Error(`TTS request failed: ${await ttsRes.text()}`);
    const mp3Stream = ttsRes.body;

    // Step 2: Convert MP3 to mulaw (8kHz) using ffmpeg
    const mulawChunks = [];
    const convertStream = ffmpeg(mp3Stream)
      .audioCodec("pcm_mulaw")
      .audioFrequency(8000)
      .format("mulaw")
      .on("error", (err) => console.error("❌ ffmpeg error:", err))
      .pipe();

    convertStream.on("data", (chunk) => mulawChunks.push(chunk));
    await pipeline(convertStream, new stream.Writable({
      write(chunk, encoding, callback) {
        callback(); // no-op sink
      }
    }));

    const ulawBuffer = Buffer.concat(mulawChunks);

    // Step 3: Send audio to Twilio via WebSocket
    if (twilioWs && twilioWs.readyState === 1) {
      twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid: streamSid,
          media: {
            payload: ulawBuffer.toString("base64"),
            track: "outbound"
          }
        })
      );
      console.log("📤 TTS audio sent to Twilio ✅");

      // ✅ Cleanly close WebSocket after short delay
      setTimeout(() => {
        if (twilioWs.readyState === 1) {
          console.log("👋 Closing WebSocket after audio flush...");
          twilioWs.close();
        }
      }, 500); // small delay to allow packet to reach Twilio
    } else {
      console.warn("⚠️ WebSocket not open – cannot send audio");
    }

  } catch (err) {
    console.error("🛑 TTS processing failed:", err);
  }
};
module.exports = synthesizeAndSend;

