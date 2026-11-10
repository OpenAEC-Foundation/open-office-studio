/** Eigen synthetische H.264/AAC-fixture; geen extern beeld, geluid of opname. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
const target = path.resolve(
  process.argv[2] ?? "src/presentatie/testbestanden/synthetic-volume.mp4",
);
if (path.extname(target).toLowerCase() !== ".mp4")
  throw new Error("Expected an .mp4 output path");
const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  const data = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    const audio = new AudioContext(),
      destination = audio.createMediaStreamDestination(),
      osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(destination);
    await audio.resume();
    osc.start();
    const stream = canvas.captureStream(12);
    for (const track of destination.stream.getAudioTracks())
      stream.addTrack(track);
    const recorder = new MediaRecorder(stream, {
        mimeType: "video/mp4",
        videoBitsPerSecond: 96000,
        audioBitsPerSecond: 32000,
      }),
      chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((r) => (recorder.onstop = r));
    let frame = 0;
    const paint = () => {
      ctx.fillStyle = "#263849";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(20 + (frame++ % 20) * 10, 65, 30, 30);
      ctx.fillStyle = "#fff";
      ctx.font = "16px sans-serif";
      ctx.fillText("OpenAEC synthetic volume probe", 15, 30);
    };
    paint();
    const poster = canvas.toDataURL("image/png");
    recorder.start();
    const timer = setInterval(paint, 80);
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(timer);
    recorder.stop();
    await stopped;
    for (const t of stream.getTracks()) t.stop();
    osc.stop();
    await audio.close();
    return {
      video: [
        ...new Uint8Array(
          await new Blob(chunks, { type: "video/mp4" }).arrayBuffer(),
        ),
      ],
      poster,
    };
  });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, new Uint8Array(data.video));
  await writeFile(
    target.replace(/\.mp4$/i, ".png"),
    Buffer.from(data.poster.split(",")[1], "base64"),
  );
  console.log(`Wrote ${data.video.length} synthetic MP4 bytes and its poster`);
} finally {
  await browser.close();
}
