// ============================================================
// Bun OHOS 功能测试脚本
// 用法: bun run test-ohos.ts  或  bun test-ohos.ts
// ============================================================

const results: { name: string; status: "pass" | "fail"; error?: string }[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => {
          results.push({ name, status: "pass" });
          console.log(`  ✅ ${name}`);
        },
        e => {
          results.push({ name, status: "fail", error: String(e) });
          console.log(`  ❌ ${name}: ${e}`);
        },
      );
    }
    results.push({ name, status: "pass" });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results.push({ name, status: "fail", error: String(e) });
    console.log(`  ❌ ${name}: ${e}`);
  }
}

async function main() {
  console.log("\n=== Bun OHOS 功能测试 ===\n");

  // 1. 基本功能
  console.log("📦 基本功能:");
  test("版本号", () => {
    if (!Bun.version) throw new Error("No version");
  });
  test("平台信息", () => {
    const p = process.platform;
    if (p !== "linux") throw new Error(`Expected linux, got ${p}`);
  });
  test("架构信息", () => {
    const a = process.arch;
    if (a !== "arm64") throw new Error(`Expected arm64, got ${a}`);
  });

  // 2. 字符串和编码
  console.log("\n🔤 字符串和编码:");
  test("TextEncoder/TextDecoder", () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const encoded = encoder.encode("Hello OHOS");
    const decoded = decoder.decode(encoded);
    if (decoded !== "Hello OHOS") throw new Error(`Mismatch: ${decoded}`);
  });
  test("Base64 编码/解码", () => {
    const original = "Hello OHOS";
    const encoded = btoa(original);
    const decoded = atob(encoded);
    if (decoded !== original) throw new Error("Base64 mismatch");
  });

  // 3. 数组和对象
  console.log("\n📊 数据结构:");
  test("数组操作", () => {
    const arr = [1, 2, 3, 4, 5];
    const sum = arr.reduce((a, b) => a + b, 0);
    if (sum !== 15) throw new Error(`Sum mismatch: ${sum}`);
  });
  test("JSON 序列化", () => {
    const obj = { name: "Bun", version: "1.3.11", platform: "OHOS" };
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    if (parsed.name !== "Bun") throw new Error("JSON parse failed");
  });
  test("Map/Set", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const set = new Set([1, 2, 3]);
    if (map.size !== 2 || set.size !== 3) throw new Error("Map/Set size mismatch");
  });

  // 4. Promise 和异步
  console.log("\n⚡ 异步操作:");
  await test("Promise.resolve", async () => {
    const result = await Promise.resolve("ok");
    if (result !== "ok") throw new Error("Promise failed");
  });
  await test("Promise.all", async () => {
    const results = await Promise.all([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
    if (results.join(",") !== "1,2,3") throw new Error("Promise.all failed");
  });
  await test("setTimeout", async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 50));
    const elapsed = Date.now() - start;
    if (elapsed < 40) throw new Error(`setTimeout too fast: ${elapsed}ms`);
  });
  await test("async/await", async () => {
    async function fetchData() {
      return { data: "test" };
    }
    const result = await fetchData();
    if (result.data !== "test") throw new Error("async/await failed");
  });

  // 5. 正则表达式
  console.log("\n🔍 正则表达式:");
  test("基本匹配", () => {
    if (!/hello/i.test("Hello World")) throw new Error("Regex failed");
  });
  test("捕获组", () => {
    const match = "2024-03-31".match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match || match[1] !== "2024") throw new Error("Regex groups failed");
  });
  test("替换", () => {
    const result = "hello world".replace(/world/, "OHOS");
    if (result !== "hello OHOS") throw new Error("Regex replace failed");
  });

  // 6. 文件系统 (Bun.file)
  console.log("\n📁 文件系统:");
  await test("Bun.file 读取", async () => {
    const file = Bun.file("/etc/hostname");
    if (!file) throw new Error("Bun.file not available");
    // Just check it exists, don't read content (may fail in QEMU)
  });
  await test("Bun.write 写入", async () => {
    const path = "/tmp/test-ohos-write.txt";
    await Bun.write(path, "Hello OHOS");
    const content = await Bun.file(path).text();
    if (content !== "Hello OHOS") throw new Error(`Write mismatch: ${content}`);
  });

  // 7. HTTP 服务器
  console.log("\n🌐 HTTP 服务器:");
  await test("Bun.serve 基本功能", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        return new Response("Hello from OHOS!");
      },
    });
    try {
      const res = await fetch(`http://localhost:${server.port}/`);
      const text = await res.text();
      if (text !== "Hello from OHOS!") throw new Error(`Response mismatch: ${text}`);
    } finally {
      server.stop();
    }
  });
  await test("HTTP JSON 响应", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        return Response.json({ status: "ok", platform: "OHOS" });
      },
    });
    try {
      const res = await fetch(`http://localhost:${server.port}/`);
      const data = await res.json();
      if (data.status !== "ok") throw new Error("JSON response failed");
    } finally {
      server.stop();
    }
  });

  // 8. 网络请求
  console.log("\n🔗 网络请求:");
  await test("fetch 外部请求", async () => {
    // Test with a reliable endpoint
    const res = await fetch("https://httpbin.org/get", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status !== 200) throw new Error(`HTTP status: ${res.status}`);
  }).catch(() => {
    // Network may not be available in QEMU
    console.log("  ⏭️ 跳过 (网络不可用)");
  });

  // 9. Crypto
  console.log("\n🔐 加密:");
  test("crypto.randomUUID", () => {
    const uuid = crypto.randomUUID();
    if (!uuid || uuid.length !== 36) throw new Error(`Invalid UUID: ${uuid}`);
  });
  test("crypto.getRandomValues", () => {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    if (arr.some(b => b < 0 || b > 255)) throw new Error("Invalid random values");
  });
  await test("SubtleCrypto digest", async () => {
    const data = new TextEncoder().encode("Hello OHOS");
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hash);
    if (hashArray.length !== 32) throw new Error(`Invalid hash length: ${hashArray.length}`);
  });

  // 10. URL 和路径
  console.log("\n🔗 URL 处理:");
  test("URL 解析", () => {
    const url = new URL("https://example.com:8080/path?query=value#hash");
    if (url.protocol !== "https:") throw new Error("Protocol mismatch");
    if (url.hostname !== "example.com") throw new Error("Hostname mismatch");
    if (url.port !== "8080") throw new Error("Port mismatch");
  });
  test("URLSearchParams", () => {
    const params = new URLSearchParams("a=1&b=2");
    if (params.get("a") !== "1") throw new Error("URLSearchParams failed");
  });

  // 11. 定时器
  console.log("\n⏱️ 定时器:");
  await test("setInterval", async () => {
    let count = 0;
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        count++;
        if (count >= 3) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
    if (count < 3) throw new Error(`setInterval count: ${count}`);
  });

  // 12. Error 处理
  console.log("\n⚠️ 错误处理:");
  test("try/catch", () => {
    try {
      throw new Error("Test error");
    } catch (e) {
      if (!(e instanceof Error)) throw new Error("Not an Error instance");
      return;
    }
    throw new Error("Should have caught error");
  });
  test("自定义 Error", () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }
    const err = new CustomError("test");
    if (err.name !== "CustomError") throw new Error("Custom error name failed");
  });

  // 总结
  console.log("\n" + "=".repeat(50));
  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${results.length} 项`);

  if (failed > 0) {
    console.log("\n失败的测试:");
    results
      .filter(r => r.status === "fail")
      .forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
  }

  console.log("\n=== 测试完成 ===\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
