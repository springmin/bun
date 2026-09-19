import { describe, expect, it } from "bun:test";
import { bunEnv, bunExe, isOhos, tempDir } from "harness";
import path from "path";

// OHOS: sharp's Linux prebuilds cannot resolve libvips on musl, so install the
// HarmonyOS port and present the platform the HarmonyOS packages expect.
let sharp: typeof import("sharp").default;
if (isOhos) {
  Object.defineProperty(process, "platform", { value: "openharmony", configurable: true });
  const dir = tempDir("sharp-ohos", {
    "package.json": JSON.stringify({
      name: "sharp-ohos",
      dependencies: { sharp: "npm:@ohos-ports/sharp@0.34.5-beta.12" },
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
  if (exitCode !== 0) throw new Error(`sharp HarmonyOS port install failed:\n${stderr}`);
  sharp = (await import(Bun.resolveSync("sharp", String(dir)))).default;
} else {
  sharp = (await import("sharp")).default;
}

describe("sharp integration tests", () => {
  it("should resize an image", async () => {
    const inputBuffer = await sharp(path.join(import.meta.dir, "bun.png"))
      .resize(200, 200)
      .toBuffer();

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
  });

  it("should convert image format", async () => {
    const inputBuffer = await sharp(path.join(import.meta.dir, "bun.png"))
      .toFormat("jpeg")
      .toBuffer();
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    expect(metadata.format).toBe("jpeg");
  });

  it("should adjust image quality", async () => {
    const inputBuffer = await sharp(path.join(import.meta.dir, "bun.png"))
      .jpeg({ quality: 70 })
      .toBuffer();
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // Here, we assume that the file size reduction is indicative of quality change
    // Note that this is an indirect way of testing quality and might need adjustments based on actual requirements
    expect(metadata.size).toBeLessThan(19767);
  });

  it("should crop the image", async () => {
    const inputBuffer = await sharp(path.join(import.meta.dir, "bun.png"))
      .extract({ width: 100, height: 100, left: 10, top: 10 })
      .toBuffer();
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
  });

  it("should rotate the image", async () => {
    const inputBuffer = await sharp(path.join(import.meta.dir, "bun.png"))
      .rotate(90)
      .toBuffer();
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    expect(metadata.width).toBe(347);
    expect(metadata.height).toBe(396);
  });
});
