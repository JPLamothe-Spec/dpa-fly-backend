// transcoder.js
const prism = require("prism-media");

let transcoder = null;
let isReady = false;

/**
 * Starts the FFmpeg transcoder with proper event hooks
 * @param {(chunk: Buffer) => void} onData - Callback for each transcoded chunk
 */
function startTranscoder(onData) {
  transcoder = new prism.FFmpeg({
    args: [
      "-f", "mulaw",        // input format
      "-ar", "8000",        // input sample rate
      "-ac", "1",           // mono input
      "-i", "pipe:0",       // from stdin
      "-f", "s16le",        // output format
      "-ar", "16000",       // output sample rate
      "-ac", "1",           // mono output
      "pipe:1"              // to stdout
    ]
  });

  // Confirm FFmpeg spawned
  transcoder.once("spawn", () => {
    isReady = true;
    console.log("🎙️ FFmpeg transcoder is ready");
  });

  // Forward audio chunks to the caller (e.g. GPT stream)
  transcoder.stdout.on("data", (chunk) => {
    console.log(`🔊 Transcoded chunk (${chunk.length} bytes)`);
    onData(chunk);
  });

  transcoder.on("error", (err) => {
    console.error("❌ Transcoder error:", err);
  });

  transcoder.on("close", (code) => {
    console.log(`⚠️ FFmpeg process exited with code ${code}`);
    isReady = false;
  });
}

/**
 * Pipes incoming raw Twilio audio into the transcoder
 * @param {Buffer} buffer - Twilio's mulaw payload
 */
function pipeToTranscoder(buffer) {
  if (isReady && transcoder?.stdin?.writable) {
    transcoder.stdin.write(buffer);
  } else {
    console.warn("⚠️ Transcoder not ready or stdin not writable");
  }
}

module.exports = {
  startTranscoder,
  pipeToTranscoder
};
