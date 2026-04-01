// ============================================================
// Bun OHOS 性能基准测试
// ============================================================

function bench(name: string, fn: () => void, iterations = 100000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const opsPerSec = Math.round((iterations / elapsed) * 1000);
  console.log(`  ${name}: ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/s)`);
  return { name, elapsed, opsPerSec };
}

function benchAsync(name: string, fn: () => Promise<void>, iterations = 10000) {
  return (async () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) await fn();
    const elapsed = performance.now() - start;
    const opsPerSec = Math.round((iterations / elapsed) * 1000);
    console.log(`  ${name}: ${elapsed.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/s)`);
    return { name, elapsed, opsPerSec };
  })();
}

async function main() {
  console.log("\n=== Bun OHOS 性能基准测试 ===\n");
  const results: { name: string; elapsed: number; opsPerSec: number }[] = [];

  // 1. 数学运算
  console.log("🔢 数学运算 (100,000 次):");
  results.push(
    bench("加法", () => {
      let _ = 1 + 2;
    }),
  );
  results.push(
    bench("乘法", () => {
      let _ = 3.14 * 2.71;
    }),
  );
  results.push(
    bench("Math.sin", () => {
      let _ = Math.sin(1.5);
    }),
  );
  results.push(
    bench("Math.sqrt", () => {
      let _ = Math.sqrt(144);
    }),
  );

  // 2. 字符串操作
  console.log("\n🔤 字符串操作 (100,000 次):");
  results.push(
    bench("字符串拼接", () => {
      let _ = "a" + "b" + "c";
    }),
  );
  results.push(
    bench("字符串替换", () => {
      let _ = "hello world".replace("world", "OHOS");
    }),
  );
  results.push(
    bench("字符串分割", () => {
      let _ = "a,b,c".split(",");
    }),
  );
  results.push(
    bench("字符串包含", () => {
      let _ = "hello world".includes("world");
    }),
  );

  // 3. 数组操作
  console.log("\n📊 数组操作 (10,000 次):");
  const arr = Array.from({ length: 100 }, (_, i) => i);
  results.push(
    bench(
      "Array.map",
      () => {
        let _ = arr.map(x => x * 2);
      },
      10000,
    ),
  );
  results.push(
    bench(
      "Array.filter",
      () => {
        let _ = arr.filter(x => x > 50);
      },
      10000,
    ),
  );
  results.push(
    bench(
      "Array.reduce",
      () => {
        let _ = arr.reduce((a, b) => a + b, 0);
      },
      10000,
    ),
  );
  results.push(
    bench(
      "Array.sort",
      () => {
        let _ = [...arr].sort((a, b) => b - a);
      },
      10000,
    ),
  );
  results.push(
    bench(
      "Array.find",
      () => {
        let _ = arr.find(x => x === 99);
      },
      10000,
    ),
  );

  // 4. 对象操作
  console.log("\n📦 对象操作 (100,000 次):");
  results.push(
    bench("对象创建", () => {
      let _ = { a: 1, b: 2, c: 3 };
    }),
  );
  results.push(
    bench("对象属性访问", () => {
      const o = { a: 1, b: 2 };
      let _ = o.a;
    }),
  );
  results.push(
    bench("Object.keys", () => {
      let _ = Object.keys({ a: 1, b: 2, c: 3 });
    }),
  );
  results.push(
    bench("Object.assign", () => {
      let _ = Object.assign({}, { a: 1 }, { b: 2 });
    }),
  );

  // 5. JSON 序列化
  console.log("\n📋 JSON 操作 (10,000 次):");
  const jsonObj = { name: "Bun", version: "1.3.11", features: ["fast", "bundler", "runtime"] };
  results.push(
    bench(
      "JSON.stringify",
      () => {
        let _ = JSON.stringify(jsonObj);
      },
      10000,
    ),
  );
  results.push(
    bench(
      "JSON.parse",
      () => {
        let _ = JSON.parse('{"a":1,"b":2}');
      },
      10000,
    ),
  );

  // 6. 正则表达式
  console.log("\n🔍 正则表达式 (10,000 次):");
  const re = /\d{4}-\d{2}-\d{2}/;
  results.push(
    bench(
      "正则匹配",
      () => {
        let _ = re.test("2024-03-31");
      },
      10000,
    ),
  );
  results.push(
    bench(
      "正则替换",
      () => {
        let _ = "2024-03-31".replace(re, "date");
      },
      10000,
    ),
  );

  // 7. Map/Set
  console.log("\n🗂️ Map/Set 操作 (100,000 次):");
  results.push(
    bench("Map.set/get", () => {
      const m = new Map();
      m.set("a", 1);
      let _ = m.get("a");
    }),
  );
  results.push(
    bench("Set.add/has", () => {
      const s = new Set();
      s.add(1);
      let _ = s.has(1);
    }),
  );

  // 8. Promise (异步)
  console.log("\n⚡ 异步操作 (1,000 次):");
  await benchAsync(
    "Promise.resolve",
    async () => {
      await Promise.resolve();
    },
    1000,
  );
  await benchAsync(
    "setTimeout 0ms",
    async () => {
      await new Promise(r => setTimeout(r, 0));
    },
    100,
  );

  // 9. crypto
  console.log("\n🔐 加密操作 (10,000 次):");
  results.push(
    bench(
      "crypto.randomUUID",
      () => {
        let _ = crypto.randomUUID();
      },
      10000,
    ),
  );
  results.push(
    bench(
      "crypto.getRandomValues",
      () => {
        const a = new Uint8Array(16);
        crypto.getRandomValues(a);
      },
      10000,
    ),
  );

  // 10. Bun API
  console.log("\n🐇 Bun API (10,000 次):");
  results.push(
    bench("Bun.version 访问", () => {
      let _ = Bun.version;
    }),
  );
  results.push(
    bench(
      "Bun.hash",
      () => {
        let _ = Bun.hash("test");
      },
      10000,
    ),
  );

  // 11. HTTP 服务器
  console.log("\n🌐 HTTP 服务器:");
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      return new Response("Hello from OHOS!");
    },
  });
  const httpResults: { elapsed: number }[] = [];
  const httpStart = performance.now();
  const httpPromises = [];
  for (let i = 0; i < 100; i++) {
    httpPromises.push(fetch(`http://localhost:${server.port}/`).then(r => r.text()));
  }
  await Promise.all(httpPromises);
  const httpElapsed = performance.now() - httpStart;
  console.log(
    `  100 次 HTTP 请求: ${httpElapsed.toFixed(2)}ms (${Math.round((100 / httpElapsed) * 1000).toLocaleString()} req/s)`,
  );
  server.stop();

  // 总结
  console.log("\n" + "=".repeat(60));
  console.log(`测试项数: ${results.length + 1}`);
  const totalOps = results.reduce((sum, r) => sum + r.opsPerSec, 0);
  const avgOps = Math.round(totalOps / results.length);
  console.log(`平均吞吐量: ${avgOps.toLocaleString()} ops/s`);
  console.log("\n=== 基准测试完成 ===\n");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
