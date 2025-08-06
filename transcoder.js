const prism = require("prism-media");

let transcoder = null;

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

  // ✅ Only listen when stdout becomes available
  transcoder.once("spawn", () => {
    console.log("🎙️ FFmpeg spawned and ready");
    transcoder.stdout.on("data", onData);
  });

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
