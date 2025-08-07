// transcoder.js

const { spawn } = require("child_process");
const prism = require("prism-media");

let ffmpeg;

/**
 * Starts the FFmpeg transcoder and pipes audio chunks to the callback.
 * Converts Twilio's mulaw@8000 to s16le@16000 mono (OpenAI compatible).
 * 
 * @param {Function} onChunk - Callback to receive audio chunks
 */
function startTranscoder(onChunk) {
  console.log(`[${new Date().toISOString()}] 🔧 Starting FFmpeg transcoder...`);

  // Spawn ffmpeg to transcode mu-law 8000hz mono to 16-bit 16khz PCM
  ffmpeg = spawn("ffmpeg", [
    "-f", "mulaw",
    "-ar", "8000",
    "-ac", "1",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "16000",
    "-ac", "1",
    "pipe:1"
  ]);

  // Handle output chunks
  ffmpeg.stdout.on("data", (chunk) => {
    console.log(`[${new Date().toISOString()}] 🟢 Transcoder emitted audio chunk (${chunk.length} bytes)`);
    onChunk(chunk);
  });

  // Log FFmpeg errors
  ffmpeg.stderr.on("data", (data) => {
    console.error(`[${new Date().toISOString()}] ⚠️ FFmpeg stderr: ${data.toString()}`);
  });

  ffmpeg.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] ❌ FFmpeg error:`, err);
  });

  ffmpeg.on("close", (code) => {
    console.warn(`[${new Date().toISOString()}] 🚪 FFmpeg process exited with code ${code}`);
  });
}

/**
 * Pipes raw media audio into the transcoder stdin.
 * @param {Buffer} audio - Incoming base64-decoded audio buffer from Twilio
 */
function pipeToTranscoder(audio) {
  if (ffmpeg && ffmpeg.stdin.writable) {
    ffmpeg.stdin.write(audio);
  } else {
    console.warn(`[${new Date().toISOString()}] ⚠️ Tried to write to FFmpeg stdin but it's not writable`);
  }
}

module.exports = {
  startTranscoder,
  pipeToTranscoder
};

