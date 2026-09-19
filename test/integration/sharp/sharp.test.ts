import { describe, expect, it } from "bun:test";
import { isOhos } from "harness";
import path from "path";

// sharp's Linux prebuilds need libvips shared libraries that OHOS's loader
// cannot resolve, and importing it throws on the failed load, so only import
// it when it can work.
const { default: sharp } = isOhos ? { default: null as any } : await import("sharp");

describe.skipIf(isOhos)("sharp integration tests", () => {
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
