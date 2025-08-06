const { spawn } = require("child_process");

let transcoder = null;

function startTranscoder(onData) {
  transcoder = spawn("ffmpeg", [
    "-f", "mulaw",
    "-ar", "8000",
    "-ac", "1",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "16000",
    "-ac", "1",
    "pipe:1"
  ]);

  transcoder.stdout.on("data", onData);

  transcoder.stderr.on("data", (data) => {
    // Optional: show FFmpeg debug logs
    console.error(`🔧 FFmpeg stderr: ${data}`);
  });

  transcoder.on("error", (err) => {
    console.error("❌ Transcoder error:", err);
  });

  transcoder.on("close", (code) => {
    console.log(`❌ Transcoder closed with code ${code}`);
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
