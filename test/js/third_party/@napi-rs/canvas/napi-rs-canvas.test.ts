// Create an image, then print it as binary to stdout
import { Jimp } from "jimp";
import { bunEnv, bunExe, isOhos, tempDir } from "harness";
import { join } from "path";

// OHOS: @napi-rs/canvas ships glibc prebuilds that cannot load, so install the
// HarmonyOS port and present the platform the HarmonyOS packages expect.
let createCanvas: typeof import("@napi-rs/canvas").createCanvas;
let loadImage: typeof import("@napi-rs/canvas").loadImage;
if (isOhos) {
  Object.defineProperty(process, "platform", { value: "openharmony", configurable: true });
  const dir = tempDir("napi-rs-canvas-ohos", {
    "package.json": JSON.stringify({
      name: "napi-rs-canvas-ohos",
      dependencies: { "@napi-rs/canvas": "npm:@ohos-ports/napi-rs-canvas@0.1.80-beta.0" },
    }),
  });
  await using install = Bun.spawn({
    cmd: [bunExe(), "install", "--os=openharmony", "--cpu=arm64"],
    cwd: String(dir),
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([install.stderr.text(), install.exited]);
  if (exitCode !== 0) throw new Error(`@napi-rs/canvas HarmonyOS port install failed:\n${stderr}`);
  ({ createCanvas, loadImage } = await import(Bun.resolveSync("@napi-rs/canvas", String(dir))));
} else {
  ({ createCanvas, loadImage } = await import("@napi-rs/canvas"));
}

describe("@napi-rs/canvas", () => {
  it("produces correct output", async () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext("2d");

    ctx.lineWidth = 10;
    ctx.strokeStyle = "red";
    ctx.fillStyle = "blue";

    ctx.fillRect(0, 0, 200, 200);
    ctx.strokeRect(50, 50, 100, 100);

    const image = await loadImage(join(__dirname, "icon-small.png"));
    ctx.drawImage(image, 0, 0);

    const expected = await Jimp.read(join(__dirname, "expected.png"));
    const actual = await Jimp.read(await canvas.encode("png"));
    expect(Array.from(actual.bitmap.data)).toEqual(Array.from(expected.bitmap.data));
  });
});
