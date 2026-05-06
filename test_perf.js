// Bun OHOS 性能基准测试 v31
// 运行: ./bun test_perf.js

const results = [];

function bench(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();
  // Measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const avg_us = (elapsed * 1000) / iterations;
  results.push({ name, iterations, total_ms: elapsed.toFixed(2), avg_us: avg_us.toFixed(2) });
}

function group(name, fn) {
  console.error(`\n[${name}]`);
  fn();
}

// ═══════════════════════════════════════════════
// 1. JSON 性能
// ═══════════════════════════════════════════════
group("json", () => {
  const obj = { a: 1, b: "hello", c: [1, 2, 3], d: { e: true } };
  const str = JSON.stringify(obj);
  bench("JSON.stringify x5000", () => JSON.stringify(obj), 5000);
  bench("JSON.parse x5000", () => JSON.parse(str), 5000);
  bench("JSON.parse large x100", () => JSON.parse(JSON.stringify({ a: Array(100).fill(0).map((_, i) => ({ id: i, name: `item_${i}` })) })), 100);
});

// ═══════════════════════════════════════════════
// 2. 数组性能
// ═══════════════════════════════════════════════
group("array", () => {
  const arr = Array(100).fill(0).map((_, i) => i);
  bench("Array.push x10000", () => { const a = []; for (let i = 0; i < 100; i++) a.push(i); }, 100);
  bench("Array.map x5000", () => arr.map(x => x * 2), 5000);
  bench("Array.filter x5000", () => arr.filter(x => x % 2 === 0), 5000);
  bench("Array.reduce x5000", () => arr.reduce((a, b) => a + b, 0), 5000);
  bench("Array.forEach x5000", () => { let s = 0; arr.forEach(x => { s += x; }); return s; }, 5000);
  bench("Array.sort x2000", () => [...arr].sort((a, b) => b - a), 2000);
  bench("Array.find x5000", () => arr.find(x => x > 50), 5000);
  bench("Array.includes x5000", () => arr.includes(50), 5000);
  bench("Array destructure x10000", () => { const [a, b, ...rest] = arr; return rest; }, 10000);
});

// ═══════════════════════════════════════════════
// 3. 字符串性能
// ═══════════════════════════════════════════════
group("string", () => {
  const str = "hello world this is a test string for benchmarking";
  const longStr = "x".repeat(10000);
  bench("String concat x1000", () => { let s = ""; for (let i = 0; i < 100; i++) s += "x"; return s; }, 1000);
  bench("String.replace x5000", () => str.replace(/o/g, "O"), 5000);
  bench("String.split x5000", () => str.split(" "), 5000);
  bench("String.indexOf x10000", () => str.indexOf("benchmark"), 10000);
  bench("String.slice x10000", () => str.slice(3, 8), 10000);
  bench("String.repeat x5000", () => "ab".repeat(50), 5000);
  bench("String.padStart x5000", () => "5".padStart(10, "0"), 5000);
  bench("Long string replace x100", () => longStr.replace(/x/g, "y"), 100);
  bench("Template literal x10000", () => `${str} ${str} ${str}`, 10000);
});

// ═══════════════════════════════════════════════
// 4. 对象性能
// ═══════════════════════════════════════════════
group("object", () => {
  const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  bench("Object.keys x10000", () => Object.keys(obj), 10000);
  bench("Object.values x10000", () => Object.values(obj), 10000);
  bench("Object.entries x10000", () => Object.entries(obj), 10000);
  bench("Object.assign x5000", () => Object.assign({}, obj, { f: 6 }), 5000);
  bench("Spread x10000", () => ({ ...obj, g: 7 }), 10000);
  bench("Property get x100000", () => { let s = 0; for (let i = 0; i < 1000; i++) s += obj.a + obj.b + obj.c; return s; }, 100);
  bench("Property set x100000", () => { const o = {}; for (let i = 0; i < 1000; i++) o[i] = i; return o; }, 100);
  bench("hasOwnProperty x10000", () => obj.hasOwnProperty("a"), 10000);
  bench("Object.freeze x1000", () => Object.freeze({ a: 1, b: 2 }), 1000);
});

// ═══════════════════════════════════════════════
// 5. 正则性能
// ═══════════════════════════════════════════════
group("regexp", () => {
  const str = "hello world 123 email@example.com +86 13800138000";
  bench("RegExp.test x10000", () => /\d+/.test(str), 10000);
  bench("RegExp.exec x10000", () => /(\w+)@(\w+)\.(\w+)/.exec(str), 10000);
  bench("RegExp.replace x5000", () => str.replace(/\d+/g, "N"), 5000);
  bench("String.match x5000", () => str.match(/\w+/g), 5000);
  bench("RegExp complex x2000", () => /^[a-z]+[\s\S]*\d+(?:\.\d+)?$/.test(str), 2000);
});

// ═══════════════════════════════════════════════
// 6. Buffer 性能
// ═══════════════════════════════════════════════
group("buffer", () => {
  const buf = Buffer.alloc(1024);
  bench("Buffer.write x10000", () => buf.write("hello world", 0), 10000);
  bench("Buffer.toString x10000", () => buf.toString("hex", 0, 16), 10000);
  bench("Buffer.alloc x5000", () => Buffer.alloc(1024), 5000);
  bench("Buffer.from(string) x5000", () => Buffer.from("hello world test string"), 5000);
  bench("Buffer.copy x5000", () => { const t = Buffer.alloc(1024); buf.copy(t); return t; }, 5000);
  bench("Buffer.concat x5000", () => Buffer.concat([buf, buf]), 5000);
  bench("Buffer slice/subarray x10000", () => buf.subarray(0, 100), 10000);
});

// ═══════════════════════════════════════════════
// 7. Crypto 性能
// ═══════════════════════════════════════════════
group("crypto", () => {
  const crypto = require("crypto");
  const data = Buffer.from("hello world benchmark data");
  bench("crypto.randomUUID x5000", () => crypto.randomUUID(), 5000);
  bench("crypto.createHash sha256 x1000", () => crypto.createHash("sha256").update(data).digest(), 1000);
  bench("crypto.createHash md5 x1000", () => crypto.createHash("md5").update(data).digest(), 1000);
  bench("crypto.createHmac x1000", () => crypto.createHmac("sha256", "key").update(data).digest(), 1000);
  bench("crypto.randomBytes(16) x1000", () => crypto.randomBytes(16), 1000);
  bench("crypto.pbkdf2Sync x50", () => crypto.pbkdf2Sync("password", "salt", 100, 32, "sha256"), 50);
  bench("crypto.timingSafeEqual x5000", () => crypto.timingSafeEqual(data, data), 5000);
});

// ═══════════════════════════════════════════════
// 8. 异步性能
// ═══════════════════════════════════════════════
group("async", () => {
  bench("Promise.resolve x10000", () => Promise.resolve(1), 10000);
  bench("Promise chain x5000", () => Promise.resolve(1).then(x => x + 1), 5000);
  bench("async/await overhead x5000", async () => { await Promise.resolve(); return 1; }, 5000);
  bench("setTimeout(0) x100", () => new Promise(r => setTimeout(r, 0)), 100);
  bench("queueMicrotask x5000", () => new Promise(r => queueMicrotask(r)), 5000);
});

// ═══════════════════════════════════════════════
// 9. 类型转换
// ═══════════════════════════════════════════════
group("coercion", () => {
  bench("Number() x10000", () => Number("123.45"), 10000);
  bench("parseInt x10000", () => parseInt("123", 10), 10000);
  bench("parseFloat x10000", () => parseFloat("123.45"), 10000);
  bench("String() x10000", () => String(123.45), 10000);
  bench("Boolean() x10000", () => Boolean(1), 10000);
  bench("toString(16) x10000", () => (255).toString(16), 10000);
  bench("JSON.parse bool x10000", () => JSON.parse("true"), 10000);
});

// ═══════════════════════════════════════════════
// 10. 数学运算
// ═══════════════════════════════════════════════
group("math", () => {
  bench("Math.sqrt x10000", () => Math.sqrt(100), 10000);
  bench("Math.sin x10000", () => Math.sin(1.5), 10000);
  bench("Math.random x10000", () => Math.random(), 10000);
  bench("Math.floor x10000", () => Math.floor(3.7), 10000);
  bench("Math.round x10000", () => Math.round(3.7), 10000);
  bench("Math.abs x10000", () => Math.abs(-5), 10000);
  bench("Math.pow x10000", () => Math.pow(2, 10), 10000);
  bench("Math.hypot x5000", () => Math.hypot(3, 4), 5000);
  bench("Math.imul x10000", () => Math.imul(3, 5), 10000);
});

// ═══════════════════════════════════════════════
// 11. 循环与函数调用
// ═══════════════════════════════════════════════
group("control_flow", () => {
  bench("for loop x500", () => { let s = 0; for (let i = 0; i < 1000; i++) s += i; return s; }, 500);
  bench("while loop x500", () => { let s = 0; let i = 0; while (i < 1000) { s += i; i++; } return s; }, 500);
  bench("nested loop x100", () => { let s = 0; for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) s += i * j; return s; }, 100);
  bench("function call x10000", () => { function f(x) { return x + 1; } return f(1); }, 10000);
  bench("arrow fn x10000", () => { const f = x => x + 1; return f(1); }, 10000);
  bench("closure x10000", () => { const f = (() => { let c = 0; return () => c++; })(); return f(); }, 10000);
  bench("try/catch no error x10000", () => { try { return 1; } catch { return 0; } }, 10000);
});

// ═══════════════════════════════════════════════
// 输出结果
// ═══════════════════════════════════════════════
console.error("\n" + "=".repeat(70));
console.error("Bun OHOS 性能基准测试结果");
console.error("=".repeat(70));
console.error(`${"测试项".padEnd(35)} ${"次数".padEnd(8)} ${"总耗时(ms)".padEnd(12)} ${"平均(us)".padEnd(10)}`);
console.error("-".repeat(70));
for (const r of results) {
  console.error(`${r.name.padEnd(35)} ${String(r.iterations).padEnd(8)} ${r.total_ms.padEnd(12)} ${r.avg_us.padEnd(10)}`);
}
console.error("-".repeat(70));
console.error(`共 ${results.length} 项性能测试`);

// 输出 JSON 方便对比
console.log("\n" + JSON.stringify(results, null, 2));
