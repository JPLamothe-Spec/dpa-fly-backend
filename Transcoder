// transcoder.js
const prism = require("prism-media");

let transcoder = null;
let outputStream = null;

function startTranscoder(onData) {
  transcoder = new prism.FFmpeg({
    args: [
      "-f", "mulaw",
      "-ar", "8000",
      "-ac", "1",
      "-i", "pipe:0",
      "-f", "s16le",
      "-ar", "16000",
      "-ac", "1",
      "pipe:1"
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
