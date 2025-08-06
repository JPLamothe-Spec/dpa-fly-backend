// transcoder.js
const prism = require("prism-media"); // ✅ THIS LINE WAS MISSING

let transcoder = null;
let outputStream = null;

function startTranscoder(onData) {
  transcoder = new prism.FFmpeg({
    args: [
      "-f", "mulaw",      // Input format from Twilio
      "-ar", "8000",      // Input sample rate
      "-ac", "1",         // Mono input
      "-i", "pipe:0",     // Read from stdin
      "-f", "s16le",      // Output format: PCM 16-bit little endian
      "-ar", "16000",     // Output sample rate
      "-ac", "1",         // Mono output
      "pipe:1"            // Write to stdout
    ]
  });

  outputStream = transcoder;
  outputStream.on("data", onData);

  outputStream.on("error", (err) => {
    console.error("❌ Transcoder error:", err);
  });
}

function pipeToTranscoder(buffer) {
  if (transcoder?.stdin?.writable) {
    transcoder.stdin.write(buffer);
  } else {
    console.warn("⚠️ Transcoder not ready or stdin not writable");
  }
}

module.exports = {
  startTranscoder,
  pipeToTranscoder
};
