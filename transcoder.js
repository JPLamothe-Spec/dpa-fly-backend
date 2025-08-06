const prism = require("prism-media");

let transcoder = null;

function startTranscoder(onData) {
  transcoder = new prism.FFmpeg({
    args: [
      "-f", "mulaw",      // Twilio input format
      "-ar", "8000",      // 8kHz sample rate
      "-ac", "1",         // mono
      "-i", "pipe:0",     // input from stdin
      "-f", "s16le",      // raw PCM output
      "-ar", "16000",     // upsample to 16kHz
      "-ac", "1",         // mono
      "pipe:1"            // output to stdout
    ]
  });

  // ✅ THIS is the fix — required to receive audio
  transcoder.stdout.on("data", onData);

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
