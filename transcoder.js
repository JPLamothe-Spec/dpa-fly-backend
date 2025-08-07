// 🔁 Updated transcoder.js for time-based flush to GPT

const prism = require("prism-media");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { PassThrough } = require("stream");

function startTranscoder(onAudioChunk) {
  const inputStream = new PassThrough();
  const outputStream = new PassThrough();

  ffmpeg.setFfmpegPath(ffmpegPath);
  const ffmpegProcess = ffmpeg()
    .input(inputStream)
    .inputFormat("mulaw")
    .audioFrequency(8000)
    .audioChannels(1)
    .audioCodec("pcm_s16le")
    .format("s16le")
    .audioFilters("aresample=16000")
    .on("start", () => {
      console.log("🔄 FFmpeg started");
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err.message);
    })
    .on("stderr", (stderrLine) => {
      console.log("⚠️ FFmpeg stderr:", stderrLine);
    })
    .pipe(outputStream);

  // Collect audio for timed flush
  let audioBuffer = [];
  let flushTimeout = setTimeout(() => flushAudio(), 3000); // 3 second trigger

  function flushAudio() {
    if (audioBuffer.length > 0) {
      const merged = Buffer.concat(audioBuffer);
      console.log("🚀 Flushing buffered audio to GPT");
      onAudioChunk(merged);
      audioBuffer = []; // Reset buffer
    } else {
      console.log("⚠️ No audio to flush to GPT");
    }
  }

  // Pass chunks to buffer
  outputStream.on("data", (chunk) => {
    audioBuffer.push(chunk);
  });

  return {
    write: (data) => inputStream.write(data),
    stop: () => {
      clearTimeout(flushTimeout);
      inputStream.end();
    },
  };
}

module.exports = startTranscoder;
