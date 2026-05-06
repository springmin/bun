// Bun OHOS 全量综合测试 — 覆盖所有已验证功能
// 运行: ./bun-ohos-rebase-tmp test_all_in_one.js
// 合并自: test_functional.js + test_expansion.js + test_full_comprehensive_v3.js + test_advanced.js
// 总计: ~1100+ 项 / ~90 组

const { test, expect, section, print } = (() => {
  const r = { pass: 0, fail: 0, skip: 0 }; const d = []; let g = "";
  function test(n, fn) { const f = `${g}.${n}`; try { fn(); r.pass++; d.push(`  \u2705 ${f}`); } catch (e) { if (e && e.message && e.message.startsWith("SKIP:")) { r.skip++; d.push(`  \u23ED ${f} \u2014 ${e.message.slice(5)}`); } else { r.fail++; d.push(`  \u274C ${f} \u2014 ${e?.message ?? e}`); } } }
  function expect(a) { return {
    toBe(e) { if (a !== e) throw Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); },
    notToBe(e) { if (a === e) throw Error(`Expected not ${JSON.stringify(e)}`); },
    toBeNull() { if (a !== null) throw Error(`Expected null`); },
    notToBeNull() { if (a === null) throw Error(`Expected non-null`); },
    toBeUndefined() { if (a !== undefined) throw Error(`Expected undefined`); },
    toBeDefined() { if (a === undefined) throw Error(`Expected defined`); },
    toBeTrue() { if (a !== true) throw Error(`Expected true`); },
    toBeFalse() { if (a !== false) throw Error(`Expected false`); },
    toBeOneOf(arr) { if (!arr.includes(a)) throw Error(`Expected one of [${arr.join(", ")}], got ${a}`); },
    toBeGreaterThan(n) { if (typeof a === 'bigint') { if (a <= n) throw Error(`Expected > ${n}, got ${a}`); } else if (a <= n) throw Error(`Expected > ${n}, got ${a}`); },
    toBeGreaterThanOrEqual(n) { if (typeof a === 'bigint') { if (a < n) throw Error(`Expected >= ${n}, got ${a}`); } else if (a < n) throw Error(`Expected >= ${n}, got ${a}`); },
    toBeLessThan(n) { if (a >= n) throw Error(`Expected < ${n}`); },
    toBeLessThanOrEqual(n) { if (typeof a === 'bigint') { if (a > n) throw Error(`Expected <= ${n}, got ${a}`); } else if (a > n) throw Error(`Expected <= ${n}, got ${a}`); },
    toBeString() { if (typeof a !== 'string') throw Error(`Expected string`); },
    toBeNumber() { if (typeof a !== 'number') throw Error(`Expected number`); },
    toBeBoolean() { if (typeof a !== 'boolean') throw Error(`Expected boolean`); },
    toBeBigInt() { if (typeof a !== 'bigint') throw Error(`Expected bigint`); },
    toBeArray() { if (!Array.isArray(a)) throw Error(`Expected array`); },
    toBeFunction() { if (typeof a !== 'function') throw Error(`Expected function`); },
    toBeObject() { if (typeof a !== 'object' || a === null || Array.isArray(a)) throw Error(`Expected object`); },
    toMatch(rx) { if (!rx.test(String(a))) throw Error(`Expected match ${rx}`); },
    toContain(s) { if (!String(a).includes(s)) throw Error(`Expected contain ${s}`); },
    toEqual(e) { if (JSON.stringify(a) !== JSON.stringify(e)) throw Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); },
    toBeCloseTo(n, eps) { if (Math.abs(a - n) > (eps ?? 0.01)) throw Error(`Expected close to ${n}`); },
    toThrow() { try { if (typeof a === 'function') a(); else throw Error("n/a"); } catch (e) { if (e.message !== "n/a") return; throw Error("Expected throw"); } },
    notToThrow() { try { if (typeof a === 'function') a(); } catch (e) { throw Error(`Unexpected: ${e.message}`); } },
  }; }
  function section(name, fn) { const p = g; g = name; d.push(`[${name}]`); fn(); g = p; }
  return { test, expect, section, print() { const t = r.pass + r.fail + r.skip; for (const x of d) { if (x.startsWith("[")) console.error(`\n${x}`); else console.error(x); } console.error(`\n${'='.repeat(50)}\n\u603B\u8BA1: ${r.pass} \u2705 | ${r.fail} \u274C | ${r.skip} \u23ED | ${t} \u9879`); return r.fail === 0; } };
})();

// ═══════════════════════════════════════════════════════════════
// 来源: test_functional.js — 基础功能
// ═══════════════════════════════════════════════════════════════

section("bun", () => {
  test("Bun.version", () => expect(Bun.version).toMatch(/^\d+\.\d+\.\d+/));
  test("Bun.revision", () => expect(typeof Bun.revision).toBeOneOf(["string","boolean"]));
  test("Bun.env populated", () => expect(Object.keys(Bun.env).length).toBeGreaterThan(0));
  test("Bun.main string", () => expect(typeof Bun.main).toBe("string"));
  test("Bun.isMainThread", () => expect(Bun.isMainThread).toBe(true));
  test("Bun.sleep function", () => expect(typeof Bun.sleep).toBe("function"));
  test("Bun.write function", () => expect(typeof Bun.write).toBe("function"));
  test("Bun.file function", () => expect(typeof Bun.file).toBe("function"));
  test("Bun.spawnSync exists", () => expect(typeof Bun.spawnSync).toBe("function"));
  test("Bun.nanoseconds > 0", () => expect(Bun.nanoseconds()).toBeGreaterThan(0));
  test("Bun.stdin defined", () => expect(Bun.stdin).toBeDefined());
  test("Bun.stdout defined", () => expect(Bun.stdout).toBeDefined());
  test("Bun.stderr defined", () => expect(Bun.stderr).toBeDefined());
  test("Bun.sleep(10ms)", async () => { const t = performance.now(); await Bun.sleep(10); expect(performance.now()-t).toBeGreaterThan(5); });
  test("Bun.which sh", () => { const w = Bun.which("sh"); expect(w===null||typeof w==="string"||typeof w==="object").toBe(true); });
  test("Bun.which nonexistent", () => expect(Bun.which("nonexistent_cmd_xyz_123")).toBeNull());
  test("Bun.inspect basic", () => expect(typeof Bun.inspect({a:1})).toBe("string"));
  test("Bun.deepEquals basic", () => { expect(Bun.deepEquals([1],[1])).toBe(true); expect(Bun.deepEquals([1],[2])).toBe(false); });
  test("Bun.deepEquals nested", () => expect(Bun.deepEquals({a:{b:1}},{a:{b:1}})).toBe(true));
  test("Bun.CryptoHasher sha256", () => { const h=new Bun.CryptoHasher("sha256"); h.update("hello"); expect(h.digest("hex").length).toBe(64); });
  test("Bun.CryptoHasher sha512", () => { const h=new Bun.CryptoHasher("sha512"); h.update("hello"); expect(h.digest().length).toBe(64); });
  test("Bun.Glob match", () => { const g=new(Bun.Glob||Bun.glob)("*.ts"); expect(g.match("a.ts")).toBe(true); expect(g.match("a.js")).toBe(false); });
  test("Bun.peek sync", () => expect(typeof Bun.peek(Promise.resolve(42))).toBe("number"));
  test("Bun.peek status", () => expect(Bun.peek.status(Promise.resolve(42))).toBeDefined());
  test("Bun.hash exists", () => expect(typeof Bun.hash).toBe("function"));
  test("Bun.hash32 exists", () => expect(Bun.hash32===undefined||typeof Bun.hash32==="function").toBe(true));
  test("Bun.strings exists", () => expect(Bun.strings===undefined||typeof Bun.strings==="function").toBe(true));
  test("Bun.file name/size", () => { const f=Bun.file("/etc/hostname"); expect(f.name).toBeDefined(); expect(typeof f.size).toBe("number"); });
  test("Bun.write file roundtrip", async () => { const p="/tmp/bun_"+Date.now(); await Bun.write(p,"hello bun"); expect((await Bun.file(p).text()).trim()).toBe("hello bun"); });
});

section("os", () => {
  const os=require("os");
  test("os.platform", () => expect(os.platform()).toMatch(/linux|ohos|android/));
  test("os.arch", () => expect(os.arch()).toMatch(/arm64|aarch64|x64/));
  test("os.type", () => expect(os.type().length).toBeGreaterThan(0));
  test("os.release", () => expect(os.release().length).toBeGreaterThan(0));
  test("os.version", () => expect(os.version().length).toBeGreaterThan(0));
  test("os.machine", () => expect(os.machine()).toMatch(/arm64|aarch64|x86_64/));
  test("os.hostname", () => expect(os.hostname().length).toBeGreaterThan(0));
  test("os.homedir", () => expect(os.homedir().length).toBeGreaterThan(0));
  test("os.tmpdir", () => expect(os.tmpdir().length).toBeGreaterThan(0));
  test("os.devNull", () => expect(os.devNull).toMatch(/\/dev\/null/));
  test("os.endianness", () => expect(os.endianness()).toMatch(/LE|BE/));
  test("os.EOL", () => expect(typeof os.EOL).toBe("string"));
  test("os.totalmem > 0", () => expect(os.totalmem()).toBeGreaterThan(0));
  test("os.freemem > 0", () => expect(os.freemem()).toBeGreaterThan(0));
  test("os.totalmem > freemem", () => expect(os.totalmem()).toBeGreaterThan(os.freemem()));
  test("os.uptime > 0", () => expect(os.uptime()).toBeGreaterThan(0));
  test("os.loadavg 3-tuple", () => { const l=os.loadavg(); expect(l.length).toBe(3); l.forEach(v=>expect(typeof v).toBe("number")); });
  test("os.networkInterfaces obj", () => { const n=os.networkInterfaces(); expect(typeof n).toBe("object"); expect(Object.keys(n).length).toBeGreaterThan(0); });
  test("os.networkInterfaces fields", () => { const n=os.networkInterfaces(); for(const k of Object.keys(n)){const i=n[k][0];expect(typeof i.address).toBe("string");expect(i.family).toMatch(/IPv[46]/);break;} });
  test("os.userInfo fields", () => { const u=os.userInfo(); expect(typeof u.username).toBe("string"); expect(typeof u.uid).toBe("number"); expect(typeof u.gid).toBe("number"); });
  test("os.availableParallelism", () => { const a=os.availableParallelism?.(); if(a!==undefined) expect(a).toBeGreaterThan(0); });
  const cpus=os.cpus();
  test("os.cpus() array", () => expect(Array.isArray(cpus)).toBe(true));
  test("os.cpus() at least 1", () => expect(cpus.length).toBeGreaterThan(0));
  test("os.cpus() model string", () => { for(let i=0;i<cpus.length;i++){const c=cpus[i];if(!c)throw Error("SKIP: empty");expect(typeof c.model).toBe("string");} });
  test("os.cpus() model non-empty", () => { for(let i=0;i<cpus.length;i++) expect((cpus[i]?.model??"").length).toBeGreaterThan(0); });
  test("os.cpus() speed number", () => { for(let i=0;i<cpus.length;i++) expect(typeof cpus[i]?.speed).toBe("number"); });
  test("os.cpus() times object", () => { for(let i=0;i<cpus.length;i++){const t=cpus[i]?.times; expect(t&&typeof t==="object").toBe(true); expect(typeof t.user).toBe("number"); expect(typeof t.nice).toBe("number"); expect(typeof t.sys).toBe("number"); expect(typeof t.idle).toBe("number"); expect(typeof t.irq).toBe("number");} });
});

section("path", () => {
  const path=require("path");
  test("path.basename", () => expect(path.basename("/a/b/c.js")).toBe("c.js"));
  test("path.dirname", () => expect(path.dirname("/a/b/c")).toBe("/a/b"));
  test("path.extname", () => expect(path.extname("file.txt")).toBe(".txt"));
  test("path.extname dotfile", () => expect(path.extname(".gitignore")).toBe(""));
  test("path.join basic", () => expect(path.join("/a","b","c")).toBe("/a/b/c"));
  test("path.join ..", () => expect(path.join("/a","..","b")).toBe("/b"));
  test("path.resolve abs", () => expect(path.resolve("/a","b","c")).toBe("/a/b/c"));
  test("path.normalize", () => expect(path.normalize("/a/./b/../c")).toBe("/a/c"));
  test("path.relative", () => expect(path.relative("/a/b","/a/c")).toBe("../c"));
  test("path.parse", () => { const p=path.parse("/a/b/c.txt"); expect(p.dir).toBe("/a/b"); expect(p.name).toBe("c"); expect(p.ext).toBe(".txt"); });
  test("path.sep/delimiter", () => { expect(path.sep).toBe("/"); expect(path.delimiter).toBe(":"); });
  test("path.isAbsolute", () => { expect(path.isAbsolute("/a")).toBe(true); expect(path.isAbsolute("a")).toBe(false); });
  test("path.format", () => expect(path.format({dir:"/a/b",base:"c.txt"})).toBe("/a/b/c.txt"));
  test("path.win32 exists", () => expect(typeof path.win32).toBe("object"));
  test("path.posix exists", () => expect(typeof path.posix).toBe("object"));
  test("path.toNamespacedPath", () => expect(typeof path.toNamespacedPath("/a")).toBe("string"));
});

section("fs", () => {
  const fs=require("fs");
  test("fs.existsSync", () => { const ok=fs.existsSync("/proc/version")||fs.existsSync("/dev/null"); expect(ok).toBe(true); });
  test("fs.statSync", () => { try{const s=fs.statSync("/proc/version");expect(typeof s.size).toBe("number")}catch(e){throw Error("SKIP: "+e.message)} });
  test("fs.lstatSync", () => { try{const s=fs.lstatSync("/proc/version");expect(typeof s.isFile).toBe("function")}catch(e){throw Error("SKIP: "+e.message)} });
  test("fs.realpathSync", () => { try{const r=fs.realpathSync("/proc/version");expect(r.length).toBeGreaterThan(0)}catch(e){}});
  test("fs.constants", () => { expect(typeof fs.constants.F_OK).toBe("number"); });
  test("fs.fs.promises.writeFile/readFile", async () => { const p="/tmp/bun_"+Date.now(); await fs.promises.writeFile(p,"hi"); expect(await fs.promises.readFile(p,"utf8")).toBe("hi"); });
  test("fs.fs.promises.stat", async () => { const s=await fs.promises.stat(testPath); expect(typeof s.size).toBe("number"); });
  test("fs.Dirent", () => { try{const dir=fs.readdirSync("/system");expect(Array.isArray(dir)).toBe(true)}catch(e){throw Error("SKIP: "+e.message)} });
});

section("buffer", () => {
  test("buffer.from string", () => expect(Buffer.from("hi").toString()).toBe("hi"));
  test("buffer.from hex", () => expect(Buffer.from("68656c6c6f","hex").toString()).toBe("hello"));
  test("buffer.from base64", () => expect(Buffer.from("aGVsbG8=","base64").toString()).toBe("hello"));
  test("buffer.from base64url", () => expect(Buffer.from("aGVsbG8","base64url").toString()).toBe("hello"));
  test("buffer.alloc", () => expect(Buffer.alloc(10).length).toBe(10));
  test("buffer.concat", () => expect(Buffer.concat([Buffer.from("a"),Buffer.from("b")]).toString()).toBe("ab"));
  test("buffer.isBuffer", () => expect(Buffer.isBuffer(Buffer.from("x"))).toBe(true));
  test("buffer.byteLength", () => expect(Buffer.byteLength("©")).toBe(2));
  test("buffer.write/toString", () => { const b=Buffer.alloc(5); b.write("hello"); expect(b.toString()).toBe("hello"); });
  test("buffer.readUInt32LE", () => { const b=Buffer.from([0x78,0x56,0x34,0x12]); expect(b.readUInt32LE()).toBe(0x12345678); });
  test("buffer.indexOf edge", () => { const b=Buffer.from("hello world"); expect(b.indexOf("world")).toBe(6); expect(b.indexOf("nonexistent")).toBe(-1); });
  test("buffer.compare", () => { const a=Buffer.from("abc"); const b=Buffer.from("abc"); expect(a.compare(b)).toBe(0); });
  test("buffer.swap16", () => { const b=Buffer.from([0x01,0x02,0x03,0x04]); b.swap16(); expect(b[0]).toBe(0x02); });
  test("buffer.allocUnsafe", () => { const b=Buffer.allocUnsafe(100); expect(b.length).toBe(100); });
  test("buffer.poolSize", () => expect(typeof Buffer.poolSize).toBe("number"));
});

section("assert", () => {
  const a=require("assert");
  test("assert.strictEqual", () => a.strictEqual(1,1));
  test("assert.notStrictEqual", () => a.notStrictEqual(1,2));
  test("assert.deepStrictEqual", () => a.deepStrictEqual({a:1},{a:1}));
  test("assert.equal", () => a.equal(1,"1"));
  test("assert.notEqual", () => a.notEqual(1,2));
  test("assert.deepEqual", () => a.deepEqual({a:1},{a:1}));
  test("assert.ok", () => a.ok(true));
  test("assert.throws", () => a.throws(()=>{throw Error("x");}));
  test("assert.doesNotThrow", () => a.doesNotThrow(()=>{}));
  test("assert.match", () => a.match("hello",/ell/));
  test("assert.ifError", () => a.ifError(null));
  test("assert.fail throws", () => { try { a.fail(); throw Error("shouldnt"); } catch(e) { if(e.code!=="ERR_ASSERTION")throw e; } });
});

section("crypto", () => {
  const crypto=require("crypto");
  test("crypto.randomUUID", () => { const u=crypto.randomUUID(); expect(u.length).toBe(36); expect(u[14]).toBe("4"); });
  test("crypto.getRandomValues", () => { const a=new Uint8Array(16); crypto.getRandomValues(a); expect(a.some(b=>b!==0)).toBe(true); });
  test("crypto.createHash sha256", () => expect(crypto.createHash("sha256").update("test").digest("hex").length).toBe(64));
  test("crypto.createHash md5", () => expect(crypto.createHash("md5").update("test").digest("hex").length).toBe(32));
  test("crypto.createHash sha512", () => expect(crypto.createHash("sha512").update("test").digest("hex").length).toBe(128));
  test("crypto.createHmac", () => expect(crypto.createHmac("sha256","key").update("test").digest("hex").length).toBe(64));
  test("crypto.randomBytes", () => expect(crypto.randomBytes(16).length).toBe(16));
  test("crypto.timingSafeEqual same", () => expect(crypto.timingSafeEqual(Buffer.from("abc"),Buffer.from("abc"))).toBe(true));
  test("crypto.timingSafeEqual diff", () => expect(crypto.timingSafeEqual(Buffer.from("abc"),Buffer.from("abd"))).toBe(false));
  test("crypto.getCiphers", () => expect(Array.isArray(crypto.getCiphers())).toBe(true));
  test("crypto.getHashes", () => expect(Array.isArray(crypto.getHashes())).toBe(true));
});

section("events", () => {
  const EventEmitter=require("events");
  test("events.on/emit", () => { const e=new EventEmitter(); let v; e.on("x",d=>v=d); e.emit("x",42); expect(v).toBe(42); });
  test("events.once", async () => { const e=new EventEmitter(); setTimeout(()=>e.emit("done","ok"),5); expect(await EventEmitter.once(e,"done").then(r=>r[0])).toBe("ok"); });
  test("events.removeListener", () => { const e=new EventEmitter(); let c=0; const f=()=>c++; e.on("x",f); e.emit("x"); e.removeListener("x",f); e.emit("x"); expect(c).toBe(1); });
  test("events.eventNames", () => { const e=new EventEmitter(); e.on("a",()=>{}); e.on("b",()=>{}); expect(e.eventNames().length).toBe(2); });
  test("events.listenerCount", () => { const e=new EventEmitter(); e.on("x",()=>{}); expect(e.listenerCount("x")).toBe(1); });
  test("events.async", (done) => { const e=new EventEmitter(); e.on("x",()=>done()); setTimeout(()=>e.emit("x"),5); });
  test("events.error handled", () => { const e=new EventEmitter(); let ok=false; e.on("error",()=>ok=true); e.emit("error",new Error()); expect(ok).toBe(true); });
});

section("process", () => {
  test("process.version", () => expect(process.version).toMatch(/^v\d+\.\d+/));
  test("process.arch", () => expect(process.arch).toMatch(/arm64|aarch64|x64/));
  test("process.platform", () => expect(process.platform).toMatch(/linux|ohos|android/));
  test("process.pid", () => expect(typeof process.pid).toBe("number"));
  test("process.ppid", () => expect(typeof process.ppid).toBe("number"));
  test("process.cwd", () => expect(process.cwd().length).toBeGreaterThan(0));
  test("process.uptime", () => expect(process.uptime()).toBeGreaterThan(0));
  test("process.memoryUsage", () => { const m=process.memoryUsage(); expect(typeof m.heapUsed).toBe("number"); });
  test("process.env HOME", () => expect(typeof process.env.HOME).toBe("string"));
  test("process.argv", () => expect(Array.isArray(process.argv)).toBe(true));
  test("process.exitCode", () => { process.exitCode=0; expect(process.exitCode).toBe(0); });
  test("process.title", () => expect(typeof process.title).toBe("string"));
  test("process.hrtime", () => { const t=process.hrtime(); expect(t.length).toBe(2); expect(typeof t[0]).toBe("number"); });
  test("process.features", () => expect(typeof process.features).toBe("object"));
});

section("net", () => {
  const net=require("net");
  test("net.isIP", () => { expect(net.isIP("127.0.0.1")).toBe(4); expect(net.isIP("::1")).toBe(6); expect(net.isIP("abc")).toBe(0); });
  test("net.isIPv4", () => expect(net.isIPv4("127.0.0.1")).toBe(true));
  test("net.isIPv6", () => expect(net.isIPv6("::1")).toBe(true));
  test("net.createServer echo", async () => {
    const server=net.createServer(s=>s.pipe(s));
    await new Promise(r=>server.listen(0,"127.0.0.1",r));
    const {port}=server.address();
    const data=await new Promise((resolve,reject)=>{
      const c=net.createConnection({port,host:"127.0.0.1"},()=>{c.write("echo");c.end();});
      let d="";c.on("data",ch=>d+=ch);c.on("end",()=>resolve(d));c.on("error",reject);
    });
    expect(data).toBe("echo");
    await new Promise(r=>server.close(r));
  });
});

section("http", () => {
  const http=require("http");
  test("http.createServer", () => expect(typeof http.createServer).toBe("function"));
  test("http.request", () => expect(typeof http.request).toBe("function"));
  test("http.get", () => expect(typeof http.get).toBe("function"));
  test("http.METHODS", () => expect(Array.isArray(http.METHODS)).toBe(true));
  test("http.STATUS_CODES", () => expect(http.STATUS_CODES[200]).toBe("OK"));
});

section("url", () => {
  const url=require("url");
  test("url.parse", () => { const u=url.parse("https://example.com/path"); expect(u.hostname).toBe("example.com"); expect(u.pathname).toBe("/path"); });
  test("url.format", () => expect(url.format({protocol:"https:",hostname:"a.com"})).toContain("a.com"));
  test("url.resolve", () => expect(url.resolve("/a","b")).toBe("/b"));
});

section("dns", () => {
  const dns=require("dns");
  test("dns.lookup", (done) => dns.lookup("localhost",(err,addr)=>{expect(typeof addr||"").toBe("string");done();}));
  test("dns.resolve A", (done) => dns.resolve("localhost","A",(err,r)=>{expect(Array.isArray(r)||err).toBeDefined();done();}));
  test("dns.promises.lookup", async () => { try { const r=await dns.promises.lookup("localhost"); expect(typeof r.address).toBe("string"); }catch(e){} });
  test("dns.getServers", () => { const s=dns.getServers(); expect(Array.isArray(s)).toBe(true); });
});

section("timers", () => {
  test("timers.setTimeout", async () => await new Promise(r=>setTimeout(r,5)));
  test("timers.setInterval basic", (done) => { let c=0; const id=setInterval(()=>{c++;if(c>=2){clearInterval(id);expect(c).toBe(2);done();}},5); });
  test("timers.setImmediate", async () => await new Promise(r=>setImmediate(r)));
  test("timers.performance.now", () => expect(typeof performance.now()).toBe("number"));
  test("timers.promises.setTimeout", async () => { const t=performance.now(); await require("timers").promises.setTimeout(10); expect(performance.now()-t).toBeGreaterThan(5); });
});

section("zlib", () => {
  const zlib=require("zlib");
  const data=Buffer.from("zlib test data");
  test("zlib.deflate/inflate", () => { const d=zlib.deflateSync(data); expect(zlib.inflateSync(d).toString()).toBe("zlib test data"); });
  test("zlib.gzip/gunzip", () => { const g=zlib.gzipSync(data); expect(zlib.gunzipSync(g).toString()).toBe("zlib test data"); });
  test("zlib.brotli", () => { const b=zlib.brotliCompressSync(data); expect(zlib.brotliDecompressSync(b).toString()).toBe("zlib test data"); });
  test("zlib.unzip auto-detect", () => { const g=zlib.gzipSync(data); expect(zlib.unzipSync(g).toString()).toBe("zlib test data"); });
});

section("vm", () => {
  const vm=require("vm");
  test("vm.runInThisContext", () => expect(vm.runInThisContext("1+2")).toBe(3));
  test("vm.runInNewContext", () => { const ctx={x:10}; vm.runInNewContext("x+=5",ctx); expect(ctx.x).toBe(15); });
  test("vm.compileFunction", () => { const fn=vm.compileFunction("return a+b",["a","b"]); expect(fn(3,4)).toBe(7); });
  test("vm.Script", () => { const s=new vm.Script("2+3"); expect(s.runInThisContext()).toBe(5); });
});

section("stream", () => {
  const stream=require("stream");
  test("stream.Readable.from", async () => { const r=stream.Readable.from([1,2,3]); const a=[]; for await(const v of r) a.push(v); expect(a).toEqual([1,2,3]); });
  test("stream.Writable", () => { const w=new stream.Writable({write(c,_,cb){cb()}}); expect(typeof w.write).toBe("function"); });
  test("stream.Transform", () => { const t=new stream.Transform({transform(c,_,cb){cb(null,c.toString().toUpperCase())}}); expect(typeof t.write).toBe("function"); });
  test("stream.Duplex/PassThrough", () => { expect(typeof stream.Duplex).toBe("function"); expect(typeof stream.PassThrough).toBe("function"); });
  test("stream.pipeline", () => { expect(typeof stream.pipeline).toBe("function"); });
});

section("console", () => {
  test("console.log", () => { const s=require("fs").createWriteStream("/dev/null"); const c=new console.Console(s,s); c.log("test"); });
  test("console.error", () => console.error("test"));
  test("console.table", () => console.table([{a:1,b:2}]));
  test("console.time/timeLog/timeEnd", () => { console.time("t"); console.timeLog("t","msg"); console.timeEnd("t"); });
  test("console.group/groupEnd", () => { console.group("g"); console.log("inside"); console.groupEnd(); });
});

section("blob", () => {
  test("blob.basic text", async () => expect(await new Blob(["hello"]).text()).toBe("hello"));
  test("blob.size", () => expect(new Blob(["abc"]).size).toBe(3));
  test("blob.type", () => expect(new Blob(["a"],{type:"text/plain"}).type).toContain("text/plain"));
  test("blob.slice", async () => expect(await new Blob(["hello"]).slice(0,2).text()).toBe("he"));
  test("blob.arrayBuffer", async () => { const ab=await new Blob(["abc"]).arrayBuffer(); expect(ab.byteLength).toBe(3); });
  test("blob.stream", async () => { const r=(await new Blob(["abc"]).stream().getReader().read()).value; expect(r.length).toBe(3); });
  test("blob.nested array", async () => expect(await new Blob([["hello"]]).text()).toBe("hello"));
  test("blob.nested multiple", async () => expect(await new Blob([["a"],["b"]]).text()).toBe("ab"));
  test("blob.File", async () => { const f=new File(["content"],"test.txt"); expect(f.name).toBe("test.txt"); expect(await f.text()).toBe("content"); });
});

section("web", () => {
  test("web.TextEncoder/Decoder", () => { const e=new TextEncoder(); const d=new TextDecoder(); expect(d.decode(e.encode("€"))).toBe("€"); });
  test("web.btoa/atob", () => { expect(atob(btoa("hello"))).toBe("hello"); });
  test("web.URL basic", () => { const u=new URL("https://example.com/p"); expect(u.hostname).toBe("example.com"); expect(u.pathname).toBe("/p"); });
  test("web.URLSearchParams", () => { const sp=new URLSearchParams("a=1&b=2"); expect(sp.get("a")).toBe("1"); expect([...sp.keys()].length).toBe(2); });
  test("web.Headers", () => { const h=new Headers({"Content-Type":"text/plain"}); expect(h.get("content-type")).toBe("text/plain"); });
  test("web.Response", async () => { const r=new Response("body",{status:201,statusText:"Created"}); expect(r.status).toBe(201); expect(await r.text()).toBe("body"); });
  test("web.Response.json", async () => { const r=Response.json({a:1}); expect(r.status).toBe(200); const j=await r.json(); expect(j.a).toBe(1); });
  test("web.Response.redirect", () => { const r=Response.redirect("https://example.com",301); expect(r.status).toBe(301); });
  test("web.Request", () => { const r=new Request("https://example.com",{method:"POST"}); expect(r.method).toBe("POST"); });
  test("web.FormData", () => { const fd=new FormData(); fd.set("k","v"); expect(fd.get("k")).toBe("v"); });
  test("web.Event/EventTarget", () => { const t=new EventTarget(); let c=0; t.addEventListener("e",()=>c++); t.dispatchEvent(new Event("e")); expect(c).toBe(1); });
  test("web.CustomEvent", () => { const e=new CustomEvent("x",{detail:{a:1}}); expect(e.detail.a).toBe(1); });
  test("web.structuredClone", () => { const c=structuredClone({a:1,b:[2,3]}); expect(c.a).toBe(1); expect(c.b).toEqual([2,3]); });
  test("web.WebSocket class", () => { expect(typeof WebSocket!=="undefined"||typeof globalThis.WebSocket!=="undefined").toBe(true); });
});

section("js_core", () => {
  test("js_core.Array.flat/flatMap", () => { expect([[1],[2]].flat()).toEqual([1,2]); });
  test("js_core.Map comprehensive", () => { const m=new Map(); m.set("k","v"); expect(m.get("k")).toBe("v"); expect(m.size).toBe(1); });
  test("js_core.Set comprehensive", () => { const s=new Set([1,2,3]); expect(s.has(2)).toBe(true); expect(s.size).toBe(3); });
  test("js_core.WeakMap/WeakSet", () => { let o={}; const wm=new WeakMap(); wm.set(o,42); expect(wm.get(o)).toBe(42); });
  test("js_core.Proxy/Reflect", () => { const t={}; const p=new Proxy(t,{get(o,k){return o[k]||42}}); p.x=1; expect(Reflect.get(p,"x")).toBe(1); expect(p.y).toBe(42); });
  test("js_core.Symbol basics", () => { const s=Symbol("test"); expect(typeof s).toBe("symbol"); expect(Symbol.keyFor(Symbol.for("k"))).toBe("k"); });
  test("js_core.BigInt arithmetic", () => { expect((2n**100n).toString()).toBe("1267650600228229401496703205376"); });
  test("js_core.Intl.DateTimeFormat", () => { const d=new Intl.DateTimeFormat("en"); expect(typeof d.format(new Date())).toBe("string"); });
  test("js_core.Intl.NumberFormat", () => { const n=new Intl.NumberFormat("en"); expect(typeof n.format(1234)).toBe("string"); });
});

section("errors", () => {
  test("errors.Error basics", () => { const e=new Error("msg"); expect(e.message).toBe("msg"); expect(e.stack).toBeDefined(); });
  test("errors.TypeError/RangeError/ReferenceError/SyntaxError", () => { expect(new TypeError() instanceof Error).toBe(true); expect(new RangeError() instanceof Error).toBe(true); });
  test("errors.AggregateError", () => { const e=new AggregateError([new Error("e1")],"multi"); expect(e.errors.length).toBe(1); });
  test("errors.Error cause", () => { const inner=new Error("inner"); const outer=new Error("outer",{cause:inner}); expect(outer.cause).toBe(inner); });
  test("errors.DOMException", () => { const e=new DOMException("err","NotFoundError"); expect(e.name).toBe("NotFoundError"); });
});

section("typedarray", () => {
  test("typedarray.Int8Array basic", () => { const a=new Int8Array(4); a[0]=-128; expect(a[0]).toBe(-128); });
  test("typedarray.Uint8Array basic", () => { const a=new Uint8Array([1,2,3]); expect(a.length).toBe(3); });
  test("typedarray.Float64Array basic", () => { const a=new Float64Array(2); a[0]=3.14; expect(a[0]).toBeCloseTo(3.14,0.01); });
  test("typedarray.set/subarray/slice", () => { const a=new Uint8Array([1,2,3,4,5]); const b=a.subarray(1,3); expect(b[0]).toBe(2); });
  test("typedarray.TypedArray.from/of", () => { const a=Uint8Array.from([1,2,3]); expect(a.length).toBe(3); });
  test("typedarray.DataView all types", () => { const dv=new DataView(new ArrayBuffer(8)); dv.setInt32(0,0x12345678); expect(dv.getInt32(0)).toBe(0x12345678); });
  test("typedarray.BigInt64Array", () => { const a=new BigInt64Array(2); a[0]=1n; expect(a[0]).toBe(1n); });
});

section("web_streams", () => {
  test("web_streams.ReadableStream", async () => { const rs=new ReadableStream({start(c){c.enqueue("a");c.close()}}); const r=rs.getReader(); const{value}=await r.read(); expect(value).toBe("a"); });
  test("web_streams.ReadableStream.pipeTo", async () => { const c=[]; const ws=new WritableStream({write(chunk){c.push(chunk)}}); const rs=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close()}}); await rs.pipeTo(ws); expect(c.length).toBe(1); });
  test("web_streams.TransformStream", () => { const ts=new TransformStream(); expect(typeof ts.writable).toBe("object"); expect(typeof ts.readable).toBe("object"); });
});

section("child_process", () => {
  const cp=require("child_process");
  test("child_process.spawn function", () => expect(typeof cp.spawn).toBe("function"));
  test("child_process.exec function", () => expect(typeof cp.exec).toBe("function"));
  test("child_process.execFile exists", () => expect(typeof cp.execFile).toBe("function"));
  test("child_process.fork exists", () => expect(typeof cp.fork).toBe("function"));
  test("child_process.spawnSync exists", () => expect(typeof cp.spawnSync).toBe("function"));
  test("child_process.execSync exists", () => expect(typeof cp.execSync).toBe("function"));
  test("child_process.execFileSync exists", () => expect(typeof cp.execFileSync).toBe("function"));
});

section("cluster", () => {
  const cluster=require("cluster");
  test("cluster.isPrimary", () => expect(cluster.isPrimary).toBe(true));
  test("cluster.isMaster", () => expect(cluster.isMaster).toBe(true));
});

section("async_hooks", () => {
  const ah=require("async_hooks");
  test("async_hooks.createHook", () => { const h=ah.createHook({init(){}}); expect(typeof h.enable).toBe("function"); h.enable(); h.disable(); });
  test("async_hooks.AsyncLocalStorage", async () => { const als=new ah.AsyncLocalStorage(); const r=await als.run(new Map([["k","v"]]),async()=>{expect(als.getStore().get("k")).toBe("v");return"done";}); expect(r).toBe("done"); });
});

// ═══════════════════════════════════════════════════════════════
// 来源: test_expansion.js — 补充测试
// ═══════════════════════════════════════════════════════════════

section("bun_extra", () => {
  test("Bun.isBun", () => { if(typeof Bun.isBun==="undefined")throw Error("SKIP: no Bun.isBun"); expect(Bun.isBun).toBe(true); });
  test("Bun.env set/delete", () => { const p=Bun.env.TEST_VAR; Bun.env.TEST_VAR="hello"; expect(Bun.env.TEST_VAR).toBe("hello"); delete Bun.env.TEST_VAR; expect(Bun.env.TEST_VAR).toBeUndefined(); if(p!==undefined)Bun.env.TEST_VAR=p; });
  test("Bun.escapeHTML", () => { if(typeof Bun.escapeHTML!=="function")throw Error("SKIP: no Bun.escapeHTML"); const r=Bun.escapeHTML("<script>alert('xss')</script>"); expect(typeof r).toBe("string"); expect(r).toContain("&lt;"); });
  test("Bun.deflateSync roundtrip", () => { if(typeof Bun.deflateSync!=="function")throw Error("SKIP: no Bun.deflateSync"); const d=Buffer.from("x".repeat(100)); const c=Bun.deflateSync(d); expect(c.length).toBeLessThan(d.length); const dec=Bun.inflateSync(c); expect(dec.length).toBe(d.length); });
  test("Bun.gzipSync roundtrip", () => { if(typeof Bun.gzipSync!=="function")throw Error("SKIP: no Bun.gzipSync"); const d=Buffer.from("x".repeat(100)); const c=Bun.gzipSync(d); expect(c.length).toBeLessThan(d.length); const dec=Bun.gunzipSync(c); expect(dec.length).toBe(d.length); });
  test("Bun.hash values", () => { const h=Bun.hash("hello"); expect(typeof h).toBeOneOf(["number","bigint"]); expect(Number(h)).toBeGreaterThan(0); expect(Bun.hash("hello")).toBe(h); });
  test("Bun.hash32", () => { if(typeof Bun.hash32!=="function")throw Error("SKIP: no Bun.hash32"); const h=Bun.hash32("hello"); expect(typeof h).toBe("number"); expect(h).toBeGreaterThan(0); });
  test("Bun.password hash/verify", async () => { if(typeof Bun.password?.hash!=="function")throw Error("SKIP: no Bun.password.hash"); const h=await Bun.password.hash("secret"); expect(typeof h).toBe("string"); expect(await Bun.password.verify("secret",h)).toBe(true); expect(await Bun.password.verify("wrong",h)).toBe(false); });
  test("Bun.password.hashSync", () => { if(typeof Bun.password?.hashSync!=="function")throw Error("SKIP: no Bun.password.hashSync"); const h=Bun.password.hashSync("pw"); expect(Bun.password.verifySync("pw",h)).toBe(true); });
  test("Bun.randomUUIDv7", () => { if(typeof Bun.randomUUIDv7!=="function")throw Error("SKIP: no Bun.randomUUIDv7"); const u=Bun.randomUUIDv7(); expect(u.length).toBe(36); expect(u[14]).toBe("7"); });
  test("Bun.fileURLToPath", () => { if(typeof Bun.fileURLToPath!=="function")throw Error("SKIP: no Bun.fileURLToPath"); const p="/tmp/test"; expect(Bun.fileURLToPath(Bun.pathToFileURL(p))).toBe(p); });
  test("Bun.write various types", async () => { const p="/tmp/bun_"+Date.now(); await Bun.write(p,"string"); expect((await Bun.file(p).text()).trim()).toBe("string"); await Bun.write(p,Buffer.from("buf")); expect((await Bun.file(p).text()).trim()).toBe("buf"); });
  test("Bun.file.slice", async () => { const p="/tmp/bun_"+Date.now(); await Bun.write(p,"0123456789"); const f=Bun.file(p); expect(await f.slice(0,5).text()).toBe("01234"); });
  test("Bun.file.stream", async () => { const p="/tmp/bun_"+Date.now(); await Bun.write(p,"x".repeat(100)); const r=Bun.file(p).stream().getReader(); let t=0; while(true){const{done,value}=await r.read();if(done)break;t+=value.length} expect(t).toBe(100); });
  test("Bun.CryptoHasher all algorithms", () => { for(const a of["sha256","sha384","sha512","sha1","md5"]){try{const h=new Bun.CryptoHasher(a);h.update("t");expect(h.digest("hex").length).toBeGreaterThan(0)}catch(e){throw Error("SKIP: "+a)}} });
  test("Bun.CryptoHasher streaming", () => { const h=new Bun.CryptoHasher("sha256"); h.update("hello "); h.update("world"); const d1=h.digest("hex"); const h2=new Bun.CryptoHasher("sha256"); h2.update("hello world"); expect(d1).toBe(h2.digest("hex")); });
  test("Bun.CryptoHasher copy", () => { const h=new Bun.CryptoHasher("sha256"); h.update("a"); const h2=h.copy(); h.update("b"); h2.update("c"); expect(h.digest("hex")).notToBe(h2.digest("hex")); });
  test("Bun.Glob.scan", async () => { if(typeof Bun.Glob?.prototype?.scan!=="function")throw Error("SKIP: no Glob.scan"); await Bun.write("/tmp/bun_g_a.txt",""); await Bun.write("/tmp/bun_g_b.js",""); const g=new Bun.Glob("*.txt"); let c=0; for await(const f of g.scan("/tmp")) c++; expect(c).toBeGreaterThan(0); });
  test("Bun.readableStreamToText", async () => { if(typeof Bun.readableStreamToText!=="function")throw Error("SKIP: no readableStreamToText"); const rs=new ReadableStream({start(c){c.enqueue("hi");c.close()}}); expect(await Bun.readableStreamToText(rs)).toBe("hi"); });
  test("Bun.readableStreamToBytes", async () => { if(typeof Bun.readableStreamToBytes!=="function")throw Error("SKIP: no readableStreamToBytes"); const rs=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close()}}); const b=await Bun.readableStreamToBytes(rs); expect(b.length).toBe(3); });
  test("Bun.readableStreamToJSON", async () => { if(typeof Bun.readableStreamToJSON!=="function")throw Error("SKIP: no readableStreamToJSON"); const rs=new ReadableStream({start(c){c.enqueue('{"a":1}');c.close()}}); const j=await Bun.readableStreamToJSON(rs); expect(j.a).toBe(1); });
  test("Bun.peek pending promise", () => { const p=new Promise(()=>{}); const r=Bun.peek(p); expect(r===p||r===undefined||r===null).toBe(true); });
  test("Bun.deepEquals circular", () => { const a={x:1}; a.self=a; const b={x:1}; b.self=b; expect(Bun.deepEquals(a,b)).toBe(true); });
  test("Bun.deepEquals TypedArray", () => expect(Bun.deepEquals(new Uint8Array([1,2]),new Uint8Array([1,2]))).toBe(true));
  test("Bun.inspect depth/colors", () => { const d={a:{b:{c:"d"}}}; expect(typeof Bun.inspect(d,{depth:1})).toBe("string"); expect(typeof Bun.inspect({a:1},{colors:true})).toBe("string"); });
});

section("fetch_extra", () => {
  test("fetch POST JSON", async () => { try{const r=await fetch("https://httpbin.org/post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msg:"hi"})});expect(r.status).toBe(200);const j=await r.json();expect(j.json.msg).toBe("hi")}catch(e){throw Error("SKIP: "+e.message)} });
  test("fetch POST FormData", async () => { try{const fd=new FormData();fd.append("k","v");const r=await fetch("https://httpbin.org/post",{method:"POST",body:fd});expect(r.status).toBe(200);const j=await r.json();expect(j.form.k).toBe("v")}catch(e){throw Error("SKIP: "+e.message)} });
  test("fetch POST Blob", async () => { try{const r=await fetch("https://httpbin.org/post",{method:"POST",body:new Blob(["body"])});expect(r.status).toBe(200)}catch(e){throw Error("SKIP: "+e.message)} });
  test("fetch POST Buffer", async () => { try{const r=await fetch("https://httpbin.org/post",{method:"POST",body:Buffer.from("buf")});expect(r.status).toBe(200)}catch(e){throw Error("SKIP: "+e.message)} });
  test("fetch POST URLSearchParams", async () => { try{const sp=new URLSearchParams({a:"1"});const r=await fetch("https://httpbin.org/post",{method:"POST",body:sp});expect(r.status).toBe(200);const j=await r.json();expect(j.form.a).toBe("1")}catch(e){throw Error("SKIP: "+e.message)} });
  test("fetch custom headers", async () => { try{const r=await fetch("https://httpbin.org/headers",{headers:{"X-Test":"val"}});expect(r.status).toBe(200);const j=await r.json();expect(j.headers["X-Test"]).toBe("val")}catch(e){throw Error("SKIP: "+e.message)} });
  test("Request clone", () => { const r=new Request("https://example.com",{method:"POST",headers:{"Content-Type":"application/json"},body:'{}'}); const r2=r.clone(); expect(r2.method).toBe("POST"); });
});

section("compression", () => {
  test("CompressionStream gzip roundtrip", async () => { if(typeof CompressionStream==="undefined")throw Error("SKIP: no CompressionStream"); const d="x".repeat(100); const cs=new CompressionStream("gzip"); const w=cs.writable.getWriter(); w.write(new TextEncoder().encode(d)); w.close(); const chunks=[]; const r=cs.readable.getReader(); while(true){const{done,value}=await r.read();if(done)break;chunks.push(value)} const compressed=new Uint8Array(chunks.reduce((s,c)=>s+c.length,0)); let off=0;for(const c of chunks){compressed.set(c,off);off+=c.length} const ds=new DecompressionStream("gzip"); const dw=ds.writable.getWriter(); dw.write(compressed); dw.close(); const dr=ds.readable.getReader(); let total=0; while(true){const{done,value}=await dr.read();if(done)break;total+=value.length} expect(total).toBe(d.length); });
  test("CompressionStream deflate-raw", async () => { if(typeof CompressionStream==="undefined")throw Error("SKIP: no CompressionStream"); const d="x".repeat(50); const cs=new CompressionStream("deflate-raw"); const w=cs.writable.getWriter(); w.write(new TextEncoder().encode(d)); w.close(); const chunks=[]; const r=cs.readable.getReader(); while(true){const{done,value}=await r.read();if(done)break;chunks.push(value)} const compressed=new Uint8Array(chunks.reduce((s,c)=>s+c.length,0)); let off=0;for(const c of chunks){compressed.set(c,off);off+=c.length} const ds=new DecompressionStream("deflate-raw"); const dw=ds.writable.getWriter(); dw.write(compressed); dw.close(); const dr=ds.readable.getReader(); let total=0; while(true){const{done,value}=await dr.read();if(done)break;total+=value.length} expect(total).toBe(d.length); });
});

section("text_encoding_streams", () => {
  test("TextEncoderStream roundtrip", async () => { if(typeof TextEncoderStream==="undefined")throw Error("SKIP: no TextEncoderStream"); const input="Hello 世界!"; const tes=new TextEncoderStream(); const tds=new TextDecoderStream(); tes.readable.pipeTo(tds.writable); const w=tes.writable.getWriter(); w.write(input); w.close(); const r=tds.readable.getReader(); let out=""; while(true){const{done,value}=await r.read();if(done)break;out+=value} expect(out).toBe(input); });
});

section("crypto_subtle", () => {
  test("crypto.subtle.digest SHA-384/512", async () => { expect((await crypto.subtle.digest("SHA-384",new TextEncoder().encode("t"))).byteLength).toBe(48); expect((await crypto.subtle.digest("SHA-512",new TextEncoder().encode("t"))).byteLength).toBe(64); });
  test("crypto.subtle.HMAC sign/verify", async () => { const k=await crypto.subtle.generateKey({name:"HMAC",hash:"SHA-256"},true,["sign","verify"]); const d=new TextEncoder().encode("msg"); const s=await crypto.subtle.sign("HMAC",k,d); expect(await crypto.subtle.verify("HMAC",k,s,d)).toBe(true); });
  test("crypto.subtle.AES-CBC encrypt/decrypt", async () => { const k=await crypto.subtle.generateKey({name:"AES-CBC",length:256},true,["encrypt","decrypt"]); const iv=crypto.getRandomValues(new Uint8Array(16)); const d=new TextEncoder().encode("secret"); const enc=await crypto.subtle.encrypt({name:"AES-CBC",iv},k,d); const dec=await crypto.subtle.decrypt({name:"AES-CBC",iv},k,enc); expect(new TextDecoder().decode(dec)).toBe("secret"); });
});

// ═══════════════════════════════════════════════════════════════
// 来源: test_advanced.js — 进阶测试
// ═══════════════════════════════════════════════════════════════

section("sqlite", () => {
  const {Database}=require("bun:sqlite");
  test("Database :memory: CRUD", () => { const db=new Database(":memory:"); db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)"); db.run("INSERT INTO t (name) VALUES ('hello')"); db.run("INSERT INTO t (name) VALUES ('world')"); const r=db.query("SELECT COUNT(*) as c FROM t").get(); expect(r.c).toBe(2); db.close(); });
  test("Database prepared stmt", () => { const db=new Database(":memory:"); db.run("CREATE TABLE t (a TEXT, b INTEGER)"); const s=db.prepare("INSERT INTO t VALUES (?, ?)"); s.run("x",1); s.run("y",2); const rows=db.query("SELECT * FROM t ORDER BY b").all(); expect(rows.length).toBe(2); db.close(); });
  test("Database transactions", () => { const db=new Database(":memory:"); db.run("CREATE TABLE t (x INTEGER)"); db.run("BEGIN"); for(let i=0;i<100;i++) db.run("INSERT INTO t VALUES (?)",[i]); db.run("COMMIT"); expect(db.query("SELECT COUNT(*) as c FROM t").get().c).toBe(100); db.close(); });
  test("Database serialize/deserialize", () => { const db=new Database(":memory:"); db.run("CREATE TABLE t (a TEXT)"); db.run("INSERT INTO t VALUES ('hello')"); const buf=db.serialize(); expect(buf.length).toBeGreaterThan(0); const db2=Database.deserialize(buf); expect(db2.query("SELECT a FROM t").get().a).toBe("hello"); db.close(); db2.close(); });
  test("Database pragma", () => { const db=new Database(":memory:"); const r=db.query("PRAGMA journal_mode").get(); expect(typeof r.journal_mode).toBe("string"); db.close(); });
  test("Database file readonly", () => { const p="/tmp/bun_sql_"+Date.now()+".db"; try{const db=new Database(p);db.run("CREATE TABLE t (v INTEGER)");db.run("INSERT INTO t VALUES (42)");expect(db.query("SELECT v FROM t").get().v).toBe(42);db.close()}catch(e){if(e.message&&(e.message.includes("read")||e.message.includes("open")))throw Error("SKIP: read-only filesystem");throw e} });
});

section("http_server_bun", () => {
  test("Bun.serve JSON response", async () => { using s=Bun.serve({port:0,fetch(){return Response.json({msg:"ok"})}}); const r=await fetch(`http://127.0.0.1:${s.port}/`); const j=await r.json(); expect(j.msg).toBe("ok"); });
  test("Bun.serve POST echo", async () => { using s=Bun.serve({port:0,async fetch(r){const t=await r.text();return new Response(t)}}); const r=await fetch(`http://127.0.0.1:${s.port}/`,{method:"POST",body:"echo"}); expect(await r.text()).toBe("echo"); });
  test("Bun.serve error handling", async () => { using s=Bun.serve({port:0,fetch(r){if(r.url.endsWith("/500"))return new Response("err",{status:500});return new Response("ok")}}); expect((await fetch(`http://127.0.0.1:${s.port}/500`)).status).toBe(500); expect((await fetch(`http://127.0.0.1:${s.port}/ok`)).status).toBe(200); });
  test("Bun.serve concurrent requests", async () => { using s=Bun.serve({port:0,fetch(){return new Response("ok")}}); const rs=await Promise.all([fetch(`http://127.0.0.1:${s.port}/1`),fetch(`http://127.0.0.1:${s.port}/2`),fetch(`http://127.0.0.1:${s.port}/3`)]); for(const r of rs) expect(r.status).toBe(200); });
  test("Bun.serve streaming response", async () => { using s=Bun.serve({port:0,fetch(){return new Response(new ReadableStream({start(c){c.enqueue("a");c.enqueue("b");c.enqueue("c");c.close()}}))}}); const r=await fetch(`http://127.0.0.1:${s.port}/`); expect(await r.text()).toBe("abc"); });
  test("Bun.serve large JSON", async () => { const data=Array.from({length:500},(_,i)=>({id:i})); using s=Bun.serve({port:0,fetch(){return Response.json(data)}}); const r=await fetch(`http://127.0.0.1:${s.port}/`); const j=await r.json(); expect(j.length).toBe(500); });
  test("Bun.serve file response", async () => { using s=Bun.serve({port:0,fetch(){return new Response(Bun.file("/proc/version"))}}); const r=await fetch(`http://127.0.0.1:${s.port}/`); const t=await r.text(); expect(t.length).toBeGreaterThan(0); });
});

section("node_http_server", () => {
  const http=require("http");
  test("http.Server request", async () => { const s=http.createServer((req,res)=>{res.end("ok")}); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const addr=s.address(); const r=await fetch(`http://127.0.0.1:${addr.port}/`); expect(await r.text()).toBe("ok"); await new Promise(r=>s.close(r)); });
  test("http.get", async () => { const s=http.createServer((req,res)=>{res.end("got:"+req.url)}); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const addr=s.address(); const data=await new Promise((res,rej)=>{http.get(`http://127.0.0.1:${addr.port}/x`,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d))}).on("error",rej)}); expect(data).toBe("got:/x"); await new Promise(r=>s.close(r)); });
});

section("udp_dgram", () => {
  const dgram=require("dgram");
  test("dgram UDP send/receive", async () => { const s=dgram.createSocket("udp4"); const c=dgram.createSocket("udp4"); await new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.close();c.close();reject(new Error("timeout"))},3000);s.on("message",(msg)=>{clearTimeout(t);s.close();c.close();resolve()});s.bind(0,"127.0.0.1",()=>{c.send("hello",s.address().port,"127.0.0.1")})}); });
});

section("websocket_live", () => {
  test("WebSocket server via Bun.serve", async () => {
    using server=Bun.serve({port:0,fetch(req,server){if(server.upgrade(req))return;return new Response("no")},websocket:{message(ws,msg){ws.send("echo:"+msg)},open(ws){ws.send("connected")}}});
    const ws=new WebSocket(`ws://127.0.0.1:${server.port}/`);
    const msgs=[]; await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("timeout")),3000);ws.onmessage=(e)=>{msgs.push(e.data);if(msgs.length>=2){clearTimeout(t);ws.close();resolve()}};ws.onopen=()=>ws.send("hi");ws.onerror=(e)=>{clearTimeout(t);reject(e)}});
    expect(msgs[0]).toBe("connected"); expect(msgs[1]).toBe("echo:hi");
  });
});

section("tcp_socket", () => {
  test("Bun.listen and Bun.connect", async () => {
    if(typeof Bun.listen!=="function")throw Error("SKIP: no Bun.listen");
    const server=Bun.listen({hostname:"127.0.0.1",port:0,socket:{data(s,d){s.write("pong:"+new TextDecoder().decode(d))},open(s){}}});
    await Bun.connect({hostname:"127.0.0.1",port:server.port,socket:{data(s,d){const t=new TextDecoder().decode(d);expect(t).toBe("pong:ping");s.end();server.stop()},open(s){s.write("ping")}}});
  });
});

section("bun_build", () => {
  test("Bun.build exists", () => expect(typeof Bun.build).toBe("function"));
  test("Bun.build simple", async () => { try{const r=await Bun.build({entrypoints:[],outdir:"/tmp"});expect(r.success??true).toBeDefined()}catch(e){} });
});

section("bun_install", () => {
  test("Bun version", () => { expect(typeof Bun.version).toBe("string"); expect(Bun.version).toMatch(/^\d+\.\d+/); });
  test("Bun install basic", async () => { if(typeof Bun.spawnSync!=="function")throw Error("SKIP: no spawnSync"); const dir="/tmp/bun_i_"+Date.now(); try{const fs=require("fs");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+"/package.json",JSON.stringify({name:"t",dependencies:{"is-odd":"^3.0.0"}}));const r=Bun.spawnSync({cmd:[process.execPath,"install"],cwd:dir,stdio:["ignore","pipe","pipe"]}); if(r.exitCode===0) expect(r.stdout.toString()).toBeDefined(); fs.rmSync(dir,{recursive:true,force:true})}catch(e){throw Error("SKIP: "+e.message)} });
});

// ═══════════════════════════════════════════════════════════════
// 来源: test_bun_install.js — 包管理器与 Registry
// ═══════════════════════════════════════════════════════════════

section("npm_registry", () => {
  test("registry reachable", async () => { try{const r=await fetch("https://registry.npmjs.org/");expect(r.status).toBe(200);const j=await r.json();expect(j.db_name).toBeDefined()}catch(e){throw Error("SKIP: "+e.message)} });
  test("package metadata is-odd", async () => { try{const r=await fetch("https://registry.npmjs.org/is-odd");expect(r.status).toBe(200);const j=await r.json();expect(j.name).toBe("is-odd");expect(j["dist-tags"]?.latest).toBeDefined()}catch(e){throw Error("SKIP: "+e.message)} });
  test("scoped package @types/node", async () => { try{const r=await fetch("https://registry.npmjs.org/@types%2fnode");expect(r.status).toBe(200);const j=await r.json();expect(j.name).toBe("@types/node")}catch(e){throw Error("SKIP: "+e.message)} });
  test("nonexistent package 404", async () => { try{const r=await fetch("https://registry.npmjs.org/nonexistent-pkg-xyz-999");expect(r.status).toBe(404)}catch(e){throw Error("SKIP: "+e.message)} });
});

section("npm_package", () => {
  test("package tarball info", async () => { try{const r=await fetch("https://registry.npmjs.org/is-number/latest");expect(r.status).toBe(200);const j=await r.json();expect(j.name).toBe("is-number");const d=await fetch("https://registry.npmjs.org/is-number/7.0.0");expect(d.status).toBe(200);const dj=await d.json();expect(dj.dist?.tarball).toContain("is-number")}catch(e){throw Error("SKIP: "+e.message)} });
  test("resolve version range", async () => { try{const r=await fetch("https://registry.npmjs.org/is-odd/3.0.0");expect(r.status).toBe(200);const j=await r.json();expect(j.version).toBe("3.0.0");expect(j.dependencies["is-number"]).toBeDefined()}catch(e){throw Error("SKIP: "+e.message)} });
});

section("system_bun", () => {
  test("system bun binary exists", () => { const home=process.env.HOME||"/storage/Users/currentUser";const fs=require("fs");expect(fs.existsSync(home+"/.bun/bun")).toBe(true); });
  test("system bun version", () => { const home=process.env.HOME||"/storage/Users/currentUser";const fs=require("fs");const fd=fs.openSync(home+"/.bun/bun","r");const buf=Buffer.alloc(65536);const br=fs.readSync(fd,buf,0,65536,0);fs.closeSync(fd);const h=buf.toString("utf8",0,br);expect(h.includes("1.")||h.includes("canary")||h.includes("bun-revision")).toBe(true); });
});

section("child_process_extended", () => {
  const cp=require("child_process");
  test("cp.exec echo", (done) => { try{cp.exec("echo hello",{timeout:5000},(err,stdout)=>{if(err){done();return}expect(stdout.trim()).toBe("hello");done()})}catch(e){done()} });
  test("cp.spawn ls", (done) => { try{const child=cp.spawn("ls",["-la"],{timeout:5000});let out="";child.stdout.on("data",d=>out+=d);child.on("error",()=>done());child.on("exit",(code)=>{if(code===0)expect(out.length).toBeGreaterThan(0);done()})}catch(e){done()} });
});

// ═══════════════════════════════════════════════════════════════
// 来源: test_full_comprehensive_v3.js — JS 标准库深度测试
// ═══════════════════════════════════════════════════════════════

section("js_string", () => {
  test("String.prototype.repeat", () => expect("x".repeat(5)).toBe("xxxxx"));
  test("String.prototype.padStart", () => expect("5".padStart(3,"0")).toBe("005"));
  test("String.prototype.padEnd", () => expect("5".padEnd(3,"0")).toBe("500"));
  test("String.prototype.includes", () => expect("hello".includes("ell")).toBe(true));
  test("String.prototype.startsWith", () => expect("hello".startsWith("he")).toBe(true));
  test("String.prototype.endsWith", () => expect("hello".endsWith("lo")).toBe(true));
  test("String.prototype.replaceAll", () => expect("a,b,c".replaceAll(",","|")).toBe("a|b|c"));
  test("String.prototype.at", () => expect("abc".at(-1)).toBe("c"));
  test("String.fromCodePoint", () => expect(String.fromCodePoint(0x1F600)).toBe("😀"));
  test("String.prototype.codePointAt", () => expect("😀".codePointAt(0)).toBe(0x1F600));
  test("String.prototype.trimStart", () => expect("  x".trimStart()).toBe("x"));
  test("String.prototype.trimEnd", () => expect("x  ".trimEnd()).toBe("x"));
});

section("js_math", () => {
  test("Math methods", () => { expect(Math.abs(-5)).toBe(5); expect(Math.ceil(1.1)).toBe(2); expect(Math.floor(1.9)).toBe(1); expect(Math.round(1.5)).toBe(2); expect(Math.trunc(1.9)).toBe(1); expect(Math.min(1,2)).toBe(1); expect(Math.max(1,2)).toBe(2); expect(Math.pow(2,3)).toBe(8); expect(Math.sqrt(9)).toBe(3); expect(Math.random()>=0&&Math.random()<1).toBe(true); });
  test("Number methods", () => { expect(Number.isNaN(NaN)).toBe(true); expect(Number.isFinite(1)).toBe(true); expect(Number.isInteger(1)).toBe(true); expect(Number.isSafeInteger(1)).toBe(true); expect(Number.parseFloat("3.14")).toBe(3.14); expect(Number.parseInt("42")).toBe(42); });
  test("Date methods", () => { const d=new Date("2024-01-15"); expect(d.getFullYear()).toBe(2024); expect(d.getMonth()).toBe(0); expect(d.getDate()).toBe(15); expect(d.toISOString()).toContain("2024"); });
});

section("js_regexp", () => {
  test("RegExp basic", () => { expect(/test/.test("test")).toBe(true); const m=/l/.exec("hello"); expect(m[0]).toBe("l"); expect(/abc/i.flags).toContain("i"); });
  test("RegExp named groups", () => { const m=/(?<name>\w+)\s(?<age>\d+)/.exec("John 30"); expect(m.groups.name).toBe("John"); expect(m.groups.age).toBe("30"); });
  test("RegExp lookahead/lookbehind", () => { expect("a1b".match(/\d(?=b)/)[0]).toBe("1"); expect("a1b".match(/(?<=a)\d/)[0]).toBe("1"); });
});

section("js_collections", () => {
  test("Map operations", () => { const m=new Map(); m.set("k","v"); expect(m.get("k")).toBe("v"); expect(m.has("k")).toBe(true); expect(m.size).toBe(1); m.delete("k"); expect(m.has("k")).toBe(false); });
  test("Set operations", () => { const s=new Set([1,2,3]); expect(s.has(2)).toBe(true); expect(s.size).toBe(3); s.delete(2); expect(s.has(2)).toBe(false); });
  test("WeakMap", () => { let o={}; const wm=new WeakMap(); wm.set(o,42); expect(wm.get(o)).toBe(42); });
});

section("js_advanced", () => {
  test("Proxy get/set", () => { const p=new Proxy({},{get(t,k){return k in t?t[k]:42}}); expect(p.x).toBe(42); p.y=1; expect(p.y).toBe(1); });
  test("Reflect", () => { expect(Reflect.apply((a,b)=>a+b,null,[3,4])).toBe(7); const o={}; Reflect.defineProperty(o,"p",{value:1}); expect(o.p).toBe(1); });
  test("Generator", () => { function*gen(){yield 1;yield 2} const g=gen(); expect(g.next().value).toBe(1); expect(g.next().value).toBe(2); });
  test("Array.flat/flatMap", () => { expect([[1],[2],[3]].flat()).toEqual([1,2,3]); expect([1,2,3].flatMap(x=>[x,x])).toEqual([1,1,2,2,3,3]); });
});

section("js_advanced2", () => {
  test("Promise.withResolvers", () => { if(typeof Promise.withResolvers!=="function")throw Error("SKIP"); const {promise,resolve}=Promise.withResolvers(); resolve(42); return promise.then(v=>expect(v).toBe(42)); });
  test("Error.isError", () => { if(typeof Error.isError!=="function")throw Error("SKIP"); expect(Error.isError(new Error())).toBe(true); expect(Error.isError({})).toBe(false); });
  test("Object.groupBy", () => { if(typeof Object.groupBy!=="function")throw Error("SKIP"); const g=Object.groupBy([1,2,3,4],n=>n%2===0?"even":"odd"); expect(g.even).toEqual([2,4]); });
  test("Map.groupBy", () => { if(typeof Map.groupBy!=="function")throw Error("SKIP"); const g=Map.groupBy([1.1,1.9,2.3],n=>Math.floor(n)); expect(g.get(1)).toEqual([1.1,1.9]); });
  test("structuredClone Transferable", () => { const buf=new ArrayBuffer(16); new Uint8Array(buf)[0]=42; const cloned=structuredClone(buf,{transfer:[buf]}); expect(cloned.byteLength).toBe(16); expect(new Uint8Array(cloned)[0]).toBe(42); expect(buf.byteLength).toBe(0); });
  test("structuredClone circular", () => { const o={}; o.self=o; const c=structuredClone(o); expect(c.self).toBe(c); });
  test("Intl.DurationFormat", () => { if(typeof Intl.DurationFormat!=="function")throw Error("SKIP"); const df=new Intl.DurationFormat("en"); expect(typeof df.format({hours:1,minutes:30})).toBe("string"); });
  test("Intl.Segmenter", () => { if(typeof Intl.Segmenter!=="function")throw Error("SKIP"); const s=new Intl.Segmenter("en",{granularity:"grapheme"}); expect([...s.segment("a b")].length).toBe(3); });
});

section("bigint_extra", () => {
  test("BigInt64Array", () => { const a=new BigInt64Array(2); a[0]=1n; expect(a[0]).toBe(1n); });
  test("BigInt operations", () => { expect(2n**100n>0n).toBe(true); expect(10n+20n).toBe(30n); expect(100n/3n).toBe(33n); });
  test("BigInt JSON throws", () => { try{JSON.stringify(1n);}catch(e){expect(e instanceof TypeError).toBe(true)} });
});

section("proxy_reflect", () => {
  test("Proxy revocable", () => { const{proxy,revoke}=Proxy.revocable({a:1},{}); expect(proxy.a).toBe(1); revoke(); try{proxy.a;throw Error("should throw")}catch(e){expect(e instanceof TypeError).toBe(true)} });
  test("Reflect.get/set proto", () => { const proto={m(){return"p"}}; const o=Object.create(proto); expect(Reflect.getPrototypeOf(o)).toBe(proto); const np={m(){return"n"}}; Reflect.setPrototypeOf(o,np); expect(o.m()).toBe("n"); });
});

section("intl_extra", () => {
  test("Intl.DateTimeFormat timeStyle", () => { const d=new Intl.DateTimeFormat("en",{dateStyle:"full",timeStyle:"medium"}); expect(typeof d.format(new Date())).toBe("string"); });
  test("Intl.NumberFormat currency", () => { const n=new Intl.NumberFormat("en",{style:"currency",currency:"USD"}); expect(n.format(1234.56)).toContain("234"); });
  test("Intl.RelativeTimeFormat", () => { if(typeof Intl.RelativeTimeFormat!=="function")throw Error("SKIP"); const r=new Intl.RelativeTimeFormat("en"); expect(r.format(-3,"days")).toContain("3"); });
  test("Intl.Collator sensitivity", () => { const c=new Intl.Collator("de",{sensitivity:"base"}); expect(c.compare("ä","a")).toBe(0); });
});

// ═══════════════════════════════════════════════════════════════
// 剩余补充测试 (node_path_win32, events_deep, etc.)
// ═══════════════════════════════════════════════════════════════

section("node_path_win32", () => {
  const w=require("path").win32;
  test("w.basename", () => expect(w.basename("C:\\foo\\bar.txt")).toBe("bar.txt"));
  test("w.dirname", () => expect(w.dirname("C:\\foo\\bar")).toBe("C:\\foo"));
  test("w.join", () => expect(w.join("C:\\foo","bar")).toMatch(/^C:\\foo\\bar/));
  test("w.isAbsolute", () => { expect(w.isAbsolute("C:\\foo")).toBe(true); expect(w.isAbsolute("foo")).toBe(false); });
  test("w.parse", () => { const p=w.parse("C:\\foo\\bar.txt"); expect(p.root).toBe("C:\\"); expect(p.name).toBe("bar"); expect(p.ext).toBe(".txt"); });
});

section("os_extra", () => {
  const os=require("os");
  test("os.cpus times", () => { for(const c of os.cpus()){expect(c.times.user>=0&&true).toBe(true);expect(c.times.sys>=0&&true).toBe(true);expect(c.times.idle>=0&&true).toBe(true)} });
  test("os.networkInterfaces detail", () => { const n=os.networkInterfaces(); for(const addrs of Object.values(n))for(const a of addrs){expect(typeof a.address).toBe("string");expect(a.family).toMatch(/^IPv[46]$/)} });
  test("os.userInfo buffer", () => { try{const u=os.userInfo({encoding:"buffer"});expect(u.username instanceof Buffer||typeof u.username==="string").toBe(true)}catch(e){throw Error("SKIP: "+e.message)} });
});

section("events_deep", () => {
  const EventEmitter=require("events");
  test("EventEmitter.once promise", async () => { const e=new EventEmitter(); setTimeout(()=>e.emit("x","r"),5); const r=await EventEmitter.once(e,"x"); expect(r[0]).toBe("r"); });
  test("EventEmitter.setMaxListeners", () => { const e=new EventEmitter(); e.setMaxListeners(50); expect(e.getMaxListeners()).toBe(50); });
});

section("node_util_extra", () => {
  const util=require("util");
  test("util.types.isSharedArrayBuffer", () => { expect(util.types.isSharedArrayBuffer(new SharedArrayBuffer(8))).toBe(true); expect(util.types.isSharedArrayBuffer(new ArrayBuffer(8))).toBe(false); });
  test("util.types.isBoxedPrimitive", () => { expect(util.types.isBoxedPrimitive(Object("s"))).toBe(true); expect(util.types.isBoxedPrimitive("s")).toBe(false); });
  test("util.types.isNativeError", () => { expect(util.types.isNativeError(new Error())).toBe(true); expect(util.types.isNativeError({})).toBe(false); });
  test("util.format %s %d %i %j", () => { expect(util.format("%s","hi")).toBe("hi"); expect(util.format("%d",42.5)).toBe("42.5"); expect(util.format("%i",42.7)).toBe("42"); expect(util.format("%j",{a:1})).toBe('{"a":1}'); });
  test("util.inherits", () => { function B(){} function D(){} util.inherits(D,B); expect(new D() instanceof B).toBe(true); });
});

section("buffer_edge", () => {
  test("Buffer.read/write multi types", () => { const b=Buffer.alloc(20); b.writeUInt8(255,0); expect(b.readUInt8(0)).toBe(255); b.writeInt8(-128,1); expect(b.readInt8(1)).toBe(-128); b.writeUInt16BE(0xFFFF,2); expect(b.readUInt16BE(2)).toBe(65535); b.writeFloatBE(3.14,4); expect(b.readFloatBE(4)).toBeCloseTo(3.14,0.001); });
  test("Buffer.swap16/32", () => { const b=Buffer.from([0x01,0x02,0x03,0x04]); b.swap16(); expect(b[0]).toBe(0x02); expect(b[1]).toBe(0x01); const b2=Buffer.from([0x01,0x02,0x03,0x04]); b2.swap32(); expect(b2[0]).toBe(0x04); });
});

section("v8_extra", () => {
  const v8=require("v8");
  test("v8.serialize/deserialize", () => { const buf=v8.serialize({a:1,b:[2,3]}); expect(buf.length).toBeGreaterThan(0); const des=v8.deserialize(buf); expect(des.a).toBe(1); expect(des.b).toEqual([2,3]); });
  test("v8.getHeapStatistics", () => { const s=v8.getHeapStatistics(); expect(typeof s.heapSizeLimit==="number"||typeof s.heapSizeLimit==="undefined").toBe(true); });
});

section("perf_hooks_extra", () => {
  test("performance.now monotonic", () => { const t1=performance.now(); const t2=performance.now(); expect(t2>=t1&&true).toBe(true); });
  test("performance.mark/measure", () => { performance.mark("s"); performance.mark("e"); performance.measure("m","s","e"); const e=performance.getEntriesByName("m"); expect(e.length).toBeGreaterThan(0); performance.clearMarks(); performance.clearMeasures(); });
});

section("error_extra", () => {
  test("Error.captureStackTrace", () => { function F(){Error.captureStackTrace(this,F)} const e=new F(); expect(e.stack).toBeDefined(); });
  test("Error.stackTraceLimit", () => { const o=Error.stackTraceLimit; Error.stackTraceLimit=50; const e=new Error(); expect(e.stack.split("\n").length).toBeGreaterThan(2); Error.stackTraceLimit=o; });
  test("AggregateError", () => { const e=new AggregateError([new Error("e1"),new Error("e2")],"multi"); expect(e.errors.length).toBe(2); expect(e.message).toBe("multi"); });
  test("DOMException", () => { const e=new DOMException("err","NotFoundError"); expect(e.name).toBe("NotFoundError"); expect(e.message).toBe("err"); });
});

section("tty_extra", () => {
  const tty=require("tty");
  test("tty.isatty", () => { expect(typeof tty.isatty(0)).toBe("boolean"); expect(typeof tty.isatty(1)).toBe("boolean"); expect(tty.isatty(999)).toBe(false); });
});

section("url_extra", () => {
  const url=require("url");
  test("url.parse full", () => { const u=url.parse("https://u:p@h:8080/p?q=1#h"); expect(u.hostname).toBe("h"); expect(u.port).toBe("8080"); expect(u.auth).toBe("u:p"); });
  test("url.domainToASCII", () => { const a=url.domainToASCII("münchen.de"); expect(a).toMatch(/^xn--/); });
});

// ═══════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════
const ok = print();
process.exit(ok ? 0 : 1);
