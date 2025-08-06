// transcoder.js
const prism = require("prism-media");

let transcoder = null;

function startTranscoder(onData) {
  transcoder = new prism.FFmpeg({
    args: [
      "-f", "mulaw",
      "-ar", "8000",
      "-ac", "1",
      "-i", "pipe:0",
      "-probesize", "32",
      "-analyzeduration", "0",
      "-af", "loudnorm",
      "-f", "flac",
      "-ar", "16000",
      "-ac", "1",
      "pipe:1"
    ]
  });

  if (transcoder.stdout) {
    transcoder.stdout.on("data", onData);
  } else {
    console.warn("⚠️ Transcoder stdout is not available");
  }

  transcoder.on("error", (err) => {
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
