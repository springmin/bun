# OHOS (HarmonyOS) Bun 适配修改清单

> 基准版本: ohos-aarch64（持续合并上游，本清单最近一次校对 2026-09-17）
> 用途: merge 上游 oven/main 时，逐项检查上游改动是否触及以下适配点。
> 检查方法: `git diff <upstream>..HEAD -- <file>` 看该文件的上游改动是否与 OHOS 门控逻辑冲突。

---

## 一、OHOS 专属文件（上游完全没有，merge 不会冲突但需保留）

| 路径 | 用途 |
|---|---|
| `scripts/ohos/build-bun-ohos-native.sh` | 原生编译脚本（brew llvm 23 + lld 23 工具链、签名） |
| `scripts/ohos/patch-node-gyp.sh` | 构建辅助（`build.sh`/`prepare-cross-libs.sh` 于 2026-09-16 删除；`build-bun-ohos.sh`/`run-all-official.sh` 于 2026-09-20 删除：已被 native 构建脚本与 optimized runner 取代） |
| `scripts/ohos/run-all-official-progress-optimized.sh` | runner 的 PATH 追加 `/system/bin`：设备工具（`mkfifo` 等）不在默认 PATH，`module-graph-isolation` 的 fixture 需要 mkfifo | 上游新增依赖系统工具的 fixture 时检查 |
| `src/ohos_sign/` | 纯字节签名库（descriptor/merkle/sha256、`sign_selfsign*`、`strip_codesign`、`is_validly_signed`、`is_elf64`）——**无 I/O、零依赖**（是 `bun_sys` 的依赖，不能反向依赖它） |
| `src/sys/ohos_sign_io.rs` | 文件级签名 I/O（bun_sys，OHOS-only）：`ensure_signed_inplace`（(dev,ino,size,mtime) 缓存 + `is_validly_signed` 校验，仅失效才重签；4 字节 magic 先探，脚本不被整读）、temp+rename 写（兼容执行后不可变 inode）、`ohos_ensure_elf_signed` FFI |
| `src/runtime/api/ant.rs` + `ant.classes.ts`（+ `test/js/bun/bun-object/ant.test.ts`） | `Bun.ant` 兼容层：Claude Code ≥ 2.1.272 依赖 Anthropic 内部构建（`@anthropic-ai/bun-internal`）的运行时 API——`setDumpable`（prctl）、`getPeerUid`/`getPeerPid`（SO_PEERCRED）、`memoryPressureLevel`（Linux PSI，1/2/4）、`CellSegmenter`（grapheme 用 `Bun__graphemeBreak`、宽度用 `Bun__visibleWidthExcludeANSI_utf16`，SGR/OSC8 池化，cells/runs 位域 + 负值扩容 + setCell/paint damage 打包） | 上游 Bun 若引入同名 API 时对齐；merge 时保留（上游无对应物） |
| `src/runtime/api/bun/ohos_node_userinfo.rs` | node:os userInfo 沙箱 uid 适配 |
| `src/install_types/resolver_hooks.rs` | OHOS 的 npm `os` 匹配 `CURRENT = LINUX`：`process.platform` 是 "linux" 且 libc 是 musl（同 Alpine），linux 声明的包必须继续匹配；**必须是单一 bit**（两 bit 会让 `os:["!linux"]` 仍经 openharmony 命中）；`openharmony` 名字保留在映射表 | 上游改 OperatingSystem/CURRENT 时检查；勿改回纯 OPENHARMONY（fixture 声明 os:[linux] 的上游 install 测试与真实包都会挂） |
| `patches/zstd/ohos-qsort-r.patch` | zstd qsort_r 适配 |
| `scripts/ohos/libcxx23-c-headers/` | LLVM 23.1.1 官方源码里的 12 个 libc++ C 兼容头（`string.h`/`wchar.h`/`errno.h`/`math.h`/`stdatomic.h`/`stdio.h`/`stdlib.h`/`uchar.h`/`wctype.h`/`complex.h`/`tgmath.h`/`__mbstate_t.h`）。brew 的 llvm ≥22 不再安装它们，而 libc++ 23 的 `<cstring>`/`<cwchar>` 仍要求，构建时叠加进 `build/ohos-cross-libs/libcxx/include/v1` |
| `.github/workflows/build-bun-ohos-native.yml` / `ohos-build-rust.yml` / `ohos-build-incremental.yml` | OHOS CI（`ohos-build.yml` 已删除） |
| `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` | 对应测试 |

## 二、构建系统 OHOS 适配（scripts/build/*.ts + webkit.ts）

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `scripts/build/deps/webkit.ts` | **13 处 cfg.ohos**：prebuilt URL、ICU 库名、**cmake 配置块**（`CMAKE_SYSTEM_NAME: "Linux"`、CMAKE_FIND_ROOT_PATH/ohosSysroot、ICU_ROOT/ohosIcuDir、`CMAKE_SYSTEM_PROCESSOR: "aarch64"`、静态 JSC 等） | ⚠️ **上游 webkit.ts 无任何 ohos 引用**——上游改 cmake 参数时需检查 OHOS 块是否仍兼容；**WEBKIT_VERSION 升级时需重新构建并验证 OHOS** |
| `scripts/build/flags.ts` | `-fno-pic/-fno-pie/-no-pie` 对 OHOS 跳过（PIE 需要） | 上游改 flags 逻辑时检查 |
| `scripts/build/rust.ts` | OHOS target 的 RUSTUP_HOME/CARGO_HOME 持久化 | 上游改 rust 构建时检查 |
| `scripts/build/rust.ts` / `scripts/build/rust/*.ts`（上游 2026-09-21 重构：每 crate 一条 ninja 边、直接链接 rlibs） | OHOS 适配：① `rust.ts` 的 `CARGO_TARGET_<triple>_LINKER` 指向 `scripts/ohos/sign-linker.sh` 并导出 `OHOS_REAL_CXX`（宿主 build script/proc-macro 链接后签名）② **`bun.ts` 的 `linkImplicitInputs` 写 `exports.list` 的条件必须含 `cfg.ohos`**（否则 ninja 报 `exports.list` missing）③ `flags.ts` 的 OHOS 导出块改用上游的 `--export-dynamic-symbol-list=exports.list` + `--version-script`（上游已删除 `src/symbols.dyn`）④ rlib 模式下 `dead_code`/`unreachable_pub` 变严格：OHOS 门控的未用项要 `pub(crate)`、`#[cfg(not(target_env="ohos"))]` 或 `#[allow(dead_code)]`（`dead-code-escape-limits.json` 含 OHOS 计数） | 上游再改 Rust 构建/链接或 lints 时，按 `test/internal/build-*.test.ts` + 全量回归复验 |
| WebKit 源获取（gh-proxy 大仓） | depth-1 全量包经 gh-proxy 常 `early EOF`；用 **partial clone**：`git config remote.origin.promisor true && git config remote.origin.partialclonefilter blob:none`，`git fetch --depth 1 --filter=blob:none origin main`，再 `git checkout FETCH_HEAD`（只拉取两版本间增量 blob；2026-09-21 WebKit bump 仅 30 文件差异） | WebKit 升级 fetch 失败时按此流程手动更新源码 |
| `patches/webkit/suspend-resume.patch` + `phase_webkit()`（`scripts/ohos/build-bun-ohos-native.sh`） | **WTF suspend/resume 加固**（OHOS stop/cont 后 `sigsuspend` 不返回 → JSC 挂起线程死锁）：① `Semaphore::waitFor(double)` 有界等待（`sem_timedwait`）② handler 的 `sigsuspend` 循环在 OHOS 改为 `sigtimedwait`（100ms 周期，条件由上游 `SuspendResumeRequest` 状态驱动）③ `Thread::suspend` 等待改 `waitFor(0.1)`（循环顶部每轮重发）。构建脚本在 checkout 后守卫式 `git apply`（reverse-check 判已应用） | ⚠️ WebKit bump 后确认补丁可在新 commit 上应用（`git apply --check`）；隔离/原子类 + SIGSTOP/CONT 探针复验 |
| `scripts/build/stream.ts` | OHOS 下构建输出的异步 `WriteStream` 在管道背压时停摆（T50：内核对管道可写事件不投递）：大量输出时静默丢行，重试耗尽后在 `writeAll` 崩溃（WebKit 全量重建时 100% 触发）。修复：`syncWrites`（musl loader 探测）下改为 `writeSync` + EAGAIN 重试（1ms 让出），输出不再丢失；其他平台保持异步 | 上游改 stream.ts 时保留该分支；构建输出量大时复验 |
| 工具链（brew） | `opt/llvm` 23.1.1（OHOS libc++，ABI `std::__n1`）+ keg-only `opt/lld` 23；`ohos-sdk` 与 llvm 主 formula 冲突已 unlink（`cc/c++` shims 走绝对路径，不受影响）；构建脚本在 `.bin` 补齐 `aarch64-linux-ohos-clang*` 三前缀 | 上游 bump LLVM 必须同步安装对应版本：`tools.ts` 的 `LLVM_VERSION_RANGE` 是硬约束 |
| `scripts/build/workarounds.ts` | "ohos-node-userinfo-preload" 等 | 上游改 preload 机制时检查 |
| `src/spawn/process.rs` `WaiterThreadPosix::prewarm()` + `src/runtime/bin_entry/mod.rs` | OHOS 强制 waiter 线程，其 eventfd 原先在**首次 spawn 才创建**，使调用方的 FD 基线（`/proc/self/fd` 差值）在场景中多 1：`module-graph-isolation` 的 `leftOpen` 与 `module-graph-workers` 的 `fdsAboveBaseline` 因此确定性失败（6 例）。修复：启动时 `prewarm()` 只创建 eventfd 不启线程（仍然在首次 spawn 时启线程）| 上游改 waiter 线程/事件循环初始化时检查；`module-graph-isolation/workers` 必须保持全通过 |
| `test/js/bun/terminal/terminal-platform-gaps.test.ts`、`test/regression/issue/18239` | pty 数据/控制投递依赖内核 epoll 缺陷的规避路径（`EPOLL_REARM_WATCH`），在真机上仍会偶发不投递；这些用例在 OHOS 上 skip（软跳过），`18239` 的数据生成脚本改为显式 `bash <script>`（设备无 `/bin/bash` shebang 目标）| 平台 epoll 缺陷修复后恢复；上游改终端行为时复测 |
| 全量负载敏感用例（7 个，单跑均通过）| 5 路并行下偶发：`host-export-callers`（静态扫描）、`module-graph-isolation`（FD 基线采样窗口）、`bunshell-instance`、`spawn-stdio-syscall-error`、`child_process_send_cb`、`regression/27272`、`cli/install/bun-install`；最终全量 32 失败中 7 个属此类（其余 25 为无网络环境类）| 若 CI 需 0 失败可对这些文件串行化（`_serial=1`）或加大其超时/轮询窗口 |
| `test/bundler/bundler_bytecode_portable.test.ts` | 合并语料（60+ 库）在 OHOS 上打包结果与跨平台快照不同（其中一个库的解析不同），JS 与字节码指纹都移动；其余条目均匹配。内联快照无法拆分 → 该跨平台一致性用例在 OHOS 跳过（其它平台 CI 继续覆盖）；loads-from-cache/compile/编码过程用例仍跑并钉住 OHOS 自身编码器 | 上游更新该快照或找到具体差异库时复测 |
| `test/integration/bun-types/bun-types.test.ts` | TS7 原生（Go）tsc 在 OHOS 上无法运行（ELF 启动器无 OHOS codesign 段；沙箱还会以 SIGSYS 拒绝 Go runtime 的系统调用），spawn tsc 的 5 个用例 skip；其余 14 例（含 LanguageService 类型检查）全通过 | 上游 TS 版本/启动器变化时复测 |
| `test/cli/install/bunx.test.ts`、`test/regression/issue/28159`、`test/regression/issue/14945` | 设备无可用 `/tmp`：bunx 清理旧缓存改用 `os.tmpdir()`；BUN_INSPECT 的 unix socket 用测试临时目录；toybox 的 `rm -rf .` 不真正删目录，生命周期脚本改用 `rm -rf \"$PWD\"` | 上游改这些路径/脚本时复测 |
| `test/cli/install/migrate-bun-lockb-v2.test.ts` | 本移植的 lockb-v2 修复（`arch: NONE → ALL`，避免平台包被跳过）会改变迁移输出的快照（缺 `"arch": []`），该 fixture 用例软跳过 | 上游 lockb 迁移行为变化时复测 |
| `test/js/bun/module-graph/module-graph-{isolation,workers}.test.ts` | fixture 的 FD 基线过滤**平台 socket**：OHOS 系统预载的 DFX 处理器（`libdfx_signalhandler.z.so`）在 **JSC 首次投递 SIGPWR**（GC 线程挂起信号，忙 worker 被 terminate 时）惰性连接 `/dev/unix/socket/hilogInput`（另见 faultloggerd），客户端 socket 随后常驻——`getpeername` 可确认对端路径。它不是 graph 的资源，故 `fds()`/`descriptors()` 用 `bun:ffi` 的 `getpeername` 排除对端为 `/dev/unix/socket/*` 的 fd（仅当 `/dev/unix/socket/hilogInput` 存在时启用；Linux/macOS 走原逻辑）| 上游改 fixture 的 FD 计数或 OHOS DFX 行为变化时复测；两文件现 479/412 全通过 |
| `src/runtime/napi/libc_check.rs` | OHOS 保留 glibc-addon 预检查（`IS_MUSL` 在 OHOS 为 true）：glibc 链接的 `.node` 在 OHOS 同样无法加载，应报 "linked against glibc" 而非 loader 的 Permission denied；提示语在 `BunProcess.cpp` 有 `#if defined(__OHOS__)` 专属分支 | 上游改该探测或其消息时检查两处分支 |
| `scripts/build.ts` / `bun.ts` / `config.ts` / `source.ts` / `shims.ts` / `tools.ts` / `deps/{cares,zstd}.ts` | OHOS 平台分支（工具链路径、依赖构建）；`bun.ts` 的 `systemLibs` 用**显式 `.a` 路径**链接本地 WebKit 的 OHOS ICU（`-licu*` 会优先 keg 里的 `.so`，把无 rpath 的 `DT_NEEDED libicu*.so.78` 烘进二进制） | 上游改构建管线/OHOS 库列表时检查 |
| OHOS 构建入口（`scripts/ohos/build-bun-ohos-native.sh`、`.github/workflows/ohos-build-*.yml`） | 显式 `--lto=off`：上游 config.ts 把 ThinLTO 默认对所有 release 打开（原先只对 linux/darwin-cross/windows-cross），OHOS 从未用 LTO 验证过，且会翻转 WebKit 的 CMAKE_BUILD_TYPE（RelWithDebInfo→Release）使既有 WebKit 构建目录失效 | ⚠️ 上游再改 LTO 默认或 WebKit buildType 时重新评估 |
| `scripts/build/source.ts` | 依赖编译的 PIC 策略：OHOS 与 Android 一样必须 `-fPIC`（上游 #42556 把 `-fno-pic -fno-pie` 默认推广到所有 unix；OHOS 上非 PIC 依赖会让链接器发 R_AARCH64_COPY，OHOS musl 不填充这些 libc 数据 → 启动即 abort） | ⚠️ 上游改 PIC 策略/新增依赖时检查 |
| `rust-toolchain.toml` | nightly-2026-07-20（OHOS Tier3 需 build-std） | ⚠️ 上游 bump 时需确认 OHOS 可用 |
| `.rust-nightly-version` | nightly-2026-07-20 | 同上 |

## 三、spawn 管道机制（T50 内核 bug 适配）——⚠️ 最高风险区

**背景**：OHOS 内核 epoll 对 pipe/socketpair **永不报告 readable**（T50），但 `ioctl(FIONREAD)` 可见字节。所有读取需绕过 poll。

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `src/runtime/cli/multi_run.rs` | ① `ProcessHandle::start`（~237/253）：start 后 `deinit_poll_keep_fd()` 取消 epoll 注册 ② `drain_ohos_pipes`/`drain_one`（579/593）：raw `libc::read` 循环到 EAGAIN，EOF 靠 read=0；不再咨询 FIONREAD（其值从未被使用，且 ioctl 失败会导致该管道永不排空）；`drain_one` 返回是否有数据 ③ 主循环（1372）：`tick_without_idle` 非阻塞 tick + drain + 自适应 sleep（有数据 2ms，连续空转后 10ms） ④ `drain_and_close_pipes`（319-355）：OHOS 分支同步 raw drain + force-end | ⚠️ **上游已多次改动此文件**（#37206/#37286）：每次 merge 需确认 OHOS 门控保留且与新逻辑兼容（drain_and_close_pipes 的 OHOS 分支是"同步 drain 后再 force-end"，不能整体跳过也不能只用 BufferedReader::read） |
| `src/io/pipes.rs` | `PollOrFd::deinit_poll_keep_fd()`（pub，仅 OHOS multi_run 用） | 上游改 PollOrFd 时检查该方法保留 |
| `src/event_loop/MiniEventLoop.rs` | `tick_without_idle` 改 `pub`（OHOS multi_run 跨 crate 调用） | ⚠️ 上游是 `pub(crate)`——上游改回 pub(crate) 会破坏 OHOS 编译 |
| `src/runtime/cli/filter_run.rs` | ① `--workspaces/--filter` 的 pipe_setup（SOCKET|NONBLOCKING flags）② **OHOS T50 排空（2026-09-17 按 multi_run 补齐）**：启动后 `deinit_poll_keep_fd`（反注册 poll，tick 直读是唯一 reader）、主循环 `tick_without_idle` + `drain_ohos_pipes`/`drain_one` 原始 fd 直读到 EAGAIN（EOF 做 `remaining_fds` 记账 + `maybe_finish`）、退出路径先排空 fd 再 force-end | 上游改 filter_run 的 drain/event-loop 时检查；`test/cli/run/filter-workspace.test.ts` 必须保持全通过（LLVM23 构建中曾因旧「跳过」实现丢输出 23 失败） |
| `src/runtime/api/bun/spawn/stdio.rs` | `can_use_memfd`/`use_memfd` OHOS 返回 false（memfd 写入对 fstat 不可见 + 子进程崩溃） | ⚠️ 上游若改 memfd 逻辑，OHOS 必须保持禁用 |
| `src/sys/lib.rs` `can_use_memfd` | OHOS 全局禁用 memfd（`excluded even though memfd_create works`） | 同上，sys 层统一门控 |
| `src/spawn_sys/spawn_process.rs` | ① memfd fast-path 三处 `not(target_env="ohos")`（CStr import、'stdio label、use_memfd 块）→ OHOS 回退 socketpair ② **shebang 手动解析**（1004-1090）：OHOS 上 exec 脚本时手动读 shebang 构造 argv（内核 shebang 处理差异） | ⚠️ 上游改 spawn 时检查 memfd 门控 + shebang shim |
| `src/spawn_sys/lib.rs` | `waiter_thread_flag::SHOULD_USE_WAITER_THREAD` 在 OHOS 默认开启（2026-09-16 移植）：异步子进程退出走 pidfd + 共享 epoll 会丢唤醒——`Bun.serve` 服务 FIFO 响应 + `stop(true)` 之后 `Bun.spawn().exited` 永不 resolve、事件循环忙等、子进程成僵尸；独立 waiter 线程 `poll(eventfd)` 绕开共享循环 | ⚠️ 上游改 waiter 线程/pidfd 路径时检查默认值 |
| `src/install/PackageManager/PackageManagerLifecycle.rs` | lifecycle PATH 注入：前置 bun_dir + node_dir（`~/.harmonybrew/bin`）+ `NODE=bun`（411-445） | ⚠️ 上游改 PATH 注入时，OHOS 前置必须保留（测试 PATH="" 场景依赖） |
| `src/io/PipeWriter.rs` | F_SETPIPE_SZ 管道缓冲扩到 1MB（~283，每次写调用，待移到建管道时）；epoll-storm 检测器仅 OHOS 编译（163+）；`unregister_poll()`（OHOS Terminal 初始空 writer 解注册，防读就绪边沿丢失；首次有数据经 backpressure `register_poll` 重注册） | 上游改 PipeWriter 时检查；terminal 套件复验 |
| `src/spawn/process.rs`（sync wait 循环 no_orphans 父监视） | 父进程 pidfd（`bun_sys::pidfd_open`）作为第 3 个 pollfd + 无 pidfd 时 100ms 超时轮询 `getppid()`；检测到父死 → `kill_sync_script_tree()` + `Global::exit(129)`。仅当 poll 循环确会运行时清 `PDEATHSIG`（继承 stdio 时保留内核 SIGKILL 兜底） | ⚠️ 上游改该 wait 循环时逐行核验；`BUN_FEATURE_FLAG_NO_ORPHANS=1` 下 kill 父进程应清理子树并以 129 退出 |

### 三-1、OHOS epoll 缺陷恢复链（watchdog / force-drain / Terminal）

另一个已确认的真机内核缺陷（与 T50 不同）：`epoll_ctl` 报成功但内核**静默停止投递**该 fd 的事件（2026-08-20 定位到裸 syscall 级；terminal 的 PTY-master reader 命中，可完全不投递）。2026-10-08 已按上游公式补强为下列恢复链：

| 组件 | 内容 |
|---|---|
| `src/io/posix_event_loop.rs` `epoll_rearm_watchdog` | ① `track/untrack`（仅 `Flags::EpollRearmWatch` opt-in 的 fd，当前 = Terminal PTY-master reader）② 后台线程按退避（250ms→1s）发**冗余 `CTL_MOD`** poke ③ **force-drain**：每 100ms tick 把 tracked userdata 交给 loop 线程（`us_wakeup_loop` → uWS post handler → `dispatch_pending`），对每个仍 tracked 的 FilePoll 强制 `update_flags(Readable)`+`on_update`（一次非阻塞读，EAGAIN 即无操作）④ SHUTDOWN/退出握手（`bun_core::add_exit_callback` + `is_exiting`，防退出期跨线程访问已释放 loop）⑤ `CTL_ADD` 遇 `EEXIST` 改发 `CTL_MOD`（关闭 fd 的内核残留项重指向）⑥ 开关：`BUN_DISABLE_EPOLL_REARM_WATCHDOG` |
| `src/uws_sys/libuwsockets.cpp` + `src/uws_sys/Loop.rs` | `uws_loop_add_post_handler`（C 包装 → `uWS::Loop::addPostHandler`），force-drain 的 loop-thread 派发通道 |
| `src/runtime/api/bun/Terminal.rs` | reader 启动即带 `EPOLL_REARM_WATCH`；初始空 writer `unregister_poll()`；`flush_kernel_buffered_output()`（close/dispose 前把内核缓冲尾读净，防 `await using` 提前关 fd 丢字节）；`deferred_exit`（同步完成的首读在其一次性通知丢失前暂存、init 末尾回放） |
| `packages/bun-usockets/src/eventing/epoll_kqueue.c` | mimalloc 空闲交接在 OHOS 下 **1ms 限速**（防每次 park 一次 futex 唤醒+owner 自旋）；`has_epoll_pwait2=0` 既定 |

**merge 检查点**：上游改 `FilePoll::register_with_fd*`/`unregister*`/`update_flags`/`on_update`、uWS Loop 的 post-handler API、Terminal 启动/关闭顺序时，逐项核对上述钩子仍在且签名兼容；terminal 套件 + `spawn-pipe-start-error`（writer 注入已按 §六 适配）+ 空闲 loadavg 复验。

## 四、syscall 层适配（src/sys/lib.rs + linux_syscall.rs）

| 位置 | 适配内容 | merge 检查点 |
|---|---|---|
| `fstat`（2117-2125） | **OHOS seccomp 对 pipe fd 的 fstat 返回 EACCES** → 返回 zeroed stat（否则 spawn 子进程初始化崩溃） | ⚠️ 上游改 fstat 时，OHOS EACCES→zeroed 分支必须保留 |
| `statx`（2183+） | OHOS 归入 musl/raw-syscall 分支（libc 无 statx wrapper） | 上游改 statx 时检查 cfg 分组 |
| `statx_fallback`（2369） | OHOS 的 EBADF 也触发 fallback（socket fd 上 statx 返回 EBADF），但**不再 latch** 全局禁用 statx（只有 ENOSYS/EOPNOTSUPP/EPERM/EINVAL 才禁用） | 同上 |
| `getcwd`（2684） | OHOS hmdfs 缓存已删 cwd → stat(".") 探测 ENOENT | 上游改 getcwd 时检查 |
| `linkat`（~2710） | OHOS 沙箱拒绝硬链接（hmdfs EACCES、/storage EPERM）→ **源码内字节复制回退**（`linkat_copy_fallback`，`#[cfg(target_env="ohos")]`；2026-09-16 起替代已删除的 LD_PRELOAD shim 的 `linkat` interpose）；复制产物 inode 不同，`EEXIST/ENOENT/目录 EPERM` 语义保持 | ⚠️ 上游改 linkat 时检查回退仍在，且 node_fs/install 调用点未被绕过 |
| `lchmod`（2955 附近） | **OHOS 无 fchmodat2（syscall 452 被 seccomp SIGSYS）** → 回退普通 chmod（bin 链接执行位依赖） | ⚠️ 上游改 lchmod 时，OHOS 回退必须保留（node-gyp 测试依赖） |
| `src/sys/linux_syscall.rs` | OHOS syscall 包装差异（fstat/statx 等） | 上游改时检查 |
| `src/bun_core/env.rs` | `IS_MUSL = cfg!(musl \|\| ohos)`；另新增 `IS_OHOS`（`cfg(target_env = "ohos")`，用于 NAPI glibc 检查等需要区分 Alpine 的场景） | 上游改 env 检测时检查 |

## 五、CLI / 运行时代码适配

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `src/runtime/cli/run_command.rs` | ① 目录遍历 EACCES/EPERM 时 fallback HOME package.json（630-720）② **`bun node <file>`**：`IS_NODE_ARG` 检测 + exec_as_if_node 移除 "node" 占位 + 重解析 node flags（3077+） | ⚠️ 上游改 run_command 时，IS_NODE_ARG 逻辑和 OHOS 目录 fallback 必须保留（as-node 测试 11 个依赖） |
| `src/runtime/cli/mod.rs` | `IS_NODE_ARG` 静态标志 + which() 的 `first_arg_name == "node"` 分支 | 同上 |
| `src/runtime/ffi/ffi_body.rs` | aarch64 系统头/库路径：OHOS_SYSROOT → /system/include → /usr/include/aarch64-linux-gnu | 上游改 FFI 默认路径时检查 |
| `src/runtime/napi/napi_body.rs` | OHOS 的 V8 符号引用（Array::New/CpuProfiler::CollectSample，`NSt4__n1` 拼写）——由 `src/jsc/bindings/v8/V8CpuProfiler.cpp`/`V8Array.cpp` 用 OHOS libc++ 自然 mangling 提供；历史 `v8_stub.cpp`（`NSt3__1`）+ 链接注入机制已于 2026-09-16 删除（注入规则在上游 link rule 重构后不再匹配、stub 符号无引用） | 上游改 napi 引用 V8 符号时，确认 C++ 兼容层仍有对应实现 |
| `src/runtime/node/node_fs.rs` | `link` OHOS 走 `bun_sys::linkat`（继承复制回退），`fs.linkSync` 因此可用 | 上游改 node:fs link 时检查 |
| `src/jsc/bindings/v8/V8Array.cpp` | `__MUSL__` 条件（禁用 libstdc++ 拼写的 alias；OHOS libc++ 走 `NSt4__n1`） | 上游改 V8Array 时检查 |
| `src/jsc/bindings/highway_json.cpp` / `src/jsc/bindings/highway_sourcemap.cpp` / `src/jsc/bindings/highway_xml.cpp` | aarch64 SVE 禁用（`HWY_DISABLED_TARGETS`）——scalable SVE 缺符号 | 上游改 highway 时检查 |
| `src/jsc/bindings/webcore/MessagePort.h` / `src/jsc/bindings/webcore/MessagePort.cpp` | ~~`m_closeEventPending` leak fix~~ 该字段从未被置位（已清理）；保留 `m_closeEventDispatched` 的 pending-activity 逻辑 | 上游改 MessagePort 生命周期时检查 |
| `src/jsc/bindings/bun-spawn.cpp` | OHOS spawn 平台分支 | 上游改时检查 |
| `src/jsc/bindings/c-bindings.cpp` | close_range 的 `#if OS(LINUX)||OS(FREEBSD)` 块闭合；**execve/pthread_create 两阶段握手**（`threads_creating`/`execve_want` register-then-verify，防 OHOS 上 clone 与 execve 簿记窗口重叠损坏；含 `#include <sched.h>`）；**`is_executable_file`**：OHOS 的 `O_EXEC` 实为 `O_PATH`（fcntl.h），不检查 x 位 → 改 `access(X_OK)` + `S_ISREG`（否则 which/PATH/install 把不可执行文件当真） | ⚠️ 上游改 close_range / 两个 wrapper / is_executable_file 时逐项核对保留 |
| `src/jsc/bindings/BunProcess.cpp` / `bun-spawn.cpp` | OHOS 平台分支 | 上游改时检查 |
| `src/install/PackageManager.rs` | node-gyp 的 CC/CXX 默认值（cc/c++，~1237）；**不再传 `-Wl,--code-sign`**（现有 ld.lld 都不接受；签名由 install/dlopen 时的 `bun_sys::ensure_signed_inplace` 负责） | ⚠️ 上游改 node-gyp 环境时，OHOS 默认编译器必须保留 |
| `src/install/PackageInstaller.rs` / `src/install/isolated_install.rs` / `src/install/isolated_install/Hardlinker.rs` | OHOS 文件系统/硬链接差异 | 上游改 install 时检查 |
| `src/resolver/lib.rs` / `src/resolver/resolver.rs` | OHOS 目录权限 fallback | 上游改 resolver 时检查 |
| `src/runtime/api/bun/js_bun_spawn_bindings.rs` | OHOS node userInfo env 注入（ohos_node_userinfo，1015） | 上游改 spawn env 时检查 |
| `src/runtime/shell/subproc.rs` | OHOS spawn 差异 | 上游改 shell 时检查 |
| `src/runtime/webcore/blob/read_file.rs` | OHOS socketpair stdio 截断修复：读循环串行化（`read_loop_state` IDLE/RUNNING/RUNNING_PENDING + `schedule_read_loop`），同一 fd 不再被并发 `do_read_loop` 争抢；该文件因此新增 1 处 `WorkPool::schedule`，`vm-thread-door` 库存随之为 3 | 上游改读循环时检查；库存用 `bun ./test/internal/source-lints/vm-thread-door.test.ts --update` 再生成 |
| `src/spawn/process.rs` | OHOS watcher/pidfd 差异 | 上游改 spawn 时检查 |
| `src/crash_handler/lib.rs` | OHOS crash 处理 | 上游改时检查 |
| `src/dns/lib.rs` / `src/runtime/dns_jsc/dns.rs` | OHOS DNS | 上游改时检查 |
| `src/standalone_graph/StandaloneModuleGraph.rs` | OHOS 差异 | 上游改时检查 |
| `src/options_types/context.rs` | OHOS 差异 | 上游改时检查 |
| `src/options_types/compile_target.rs` | `Libc::Ohos`：默认编译目标带 `-ohos` libc 后缀并接受 `target` 里的 `ohos` token；**`process.platform` 折叠为 `"linux"`**（与运行时一致——若折叠成 `"openharmony"`，同一编译产物里静态折叠值与动态取值会不一致，`platform-specific-binary` 用例会失败） | 上游改 CompileTarget/define 折叠时检查；`test/bundler/bundler_compile.test.ts` 的 `compile/platform-specific-binary*` 必须保持通过 |
| `src/runtime/bin_entry/mod.rs` | OHOS 入口差异（TMPDIR 回退等） | 上游改时检查 |
| `src/runtime/api.rs` | OHOS API 注册 | 上游改时检查 |

## 六、测试文件 OHOS 特判

| 文件 | 内容 | merge 检查点 |
|---|---|---|
| `test/cli/run/garbage-env.test.ts` | `isOhos`（BUN_OHOS / musl loader 探测）下 binary-sign-tool 签名 | 上游改该测试时检查 |
| `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` | OHOS 专属测试 | 保留 |

### 六-0、平台依赖测试的 OHOS 处理（2026-09-19，@ohos-ports 优先）

原则：**有鸿蒙适配包（`@ohos-ports/*`）优先使用，没有才回退 Linux musl 包**。

| 文件 | 内容 | merge 检查点 |
|---|---|---|
| `test/harness.ts`（`getSecret`） | OHOS 缺密钥返回 `undefined`（非 CI 抛错语义） | 上游改 getSecret 时保留 OHOS 分支 |
| `test/integration/esbuild/esbuild.test.ts` | 装 `@ohos-ports/esbuild@0.25.5`（别名成 `esbuild`，`--os=openharmony --cpu=arm64`）；estrella 用 overrides；版本断言按 OHOS 调整 | 上游改安装/断言时保留 isOhos 分支 |
| `test/integration/sharp/sharp.test.ts` | OHOS 临时目录装 `@ohos-ports/sharp`（`--os=openharmony`），覆盖 `process.platform` 后动态导入 | 上游改导入结构时保留 |
| `test/js/third_party/@napi-rs/canvas/napi-rs-canvas.test.ts` | OHOS 装 `@ohos-ports/napi-rs-canvas`（自带 `skia.openharmony-arm64.node`），覆盖平台后导入 | 同上 |
| `test/js/third_party/pnpm/pnpm.test.ts` | fixture 的 `pnpm.overrides` 把 esbuild 指向 OHOS 端口（vite5→esbuild；rollup 走 musl 回退） | 上游改 fixture 时保留 |
| `test/js/third_party/next-auth/next-auth.test.ts` | OHOS 用 `@ohos-ports/next` + `next-swc-openharmony-arm64`；preload 覆盖 `process.platform` **和** `os.platform`；swc 包补 `@next/swc-openharmony-arm64` 别名与版本号；去掉 next16 已删除的 `eslint` 配置 | 上游改 fixture/超时 时保留 |
| `test/integration/next-pages/test/next-build.test.ts`、`dev-server-ssr-100.test.ts` | 仍 skip：port 可用（`next build` 已验证可编译），但用例快照的是 28k 行 lockfile（平台相关），解除需平台化快照 | 上游改快照机制时再看 |
| `test/integration/expo-app/expo.test.ts` | 仍 skip：`@ohos-ports/expo` 是 57.x，fixture 是 expo 51，跨度过大 | 上游升级 fixture 后重估 |
| `test/integration/datadog-pprof/datadog-pprof.test.ts` | 仍 skip：`@ohos-ports/datadog-pprof` 有 OHOS 预编译，但该 addon 依赖 **V8 符号**（Bun 是 JSC）无法加载 | 除非上游 isOhos 化 |
| `test/js/third_party/prisma/prisma.test.ts` | canvas 条件导入（CI 下其余用例本来就 skip） | 同上 |
| `test/js/third_party/grpc-js/test-resolver.test.ts` | IPv6 断言加 `&& !isOhos`（设备 hosts 只把 ::1 映射到 ip6-localhost） | 上游改该断言时保留 |
| `test/js/bun/util/inspect-error-leak.test.js`、`test/cli/run/require-cache.test.ts` | 用例预算按 OHOS 放宽（10s→60s、60s→180s），负载下会超出 | 上游改超时参数时保留 |
| **已撤销的 skip（2026-09-20 审计，两批共 11 处）** | 第一批：`bun-add` git、`bun-install-registry` git-dependencies、`spawn-stdin-readable-stream` ×2、`cli/test/isolation`；第二批：`napi-value-ffi` ×3、`spawn`（FORCE_WAITER 用例）、`node-http-connect`、`run-crash-handler`（组信号用例实测通过）| 保留：unix socket（沙箱 EPERM）、PTY Ctrl-Z/Ctrl+C、ELF 布局、FUSE、TS7、napi bigints（负载 100x 慢）、http3 cold-post（时序敏感）|
| `test/regression/issue/24364.test.ts` | OHOS 用 `typescript@5 --ignore-scripts`（TS7 原生编译器无 OHOS 版、npm `bun` 包 postinstall 拒绝该平台） | 上游改安装参数时保留 |
| `test/internal/source-lints/build-rust.test.ts`、`ci-image-pins.test.ts` | `rust-toolchain.toml` 多出 `aarch64-unknown-linux-ohos`（OHOS Tier3 target，构建用）；两处 lint 断言都把该 triple 计入期望集合（build-rust 加在 prebuilt 列表，ci-image-pins 加在 CI image pins 列表） | 上游改这两个 lint 或 rust-toolchain 时保留 |
| `test/js/web/streams/bun-streams-test-fifo.sh` | OHOS 拒绝以 `O_APPEND` 打开 FIFO（bash `>>` 报 EACCES），读取端随后永久阻塞 → 整个 `streams.test.js` 超时；改为 `>`（FIFO 上语义相同）；runner 同步把该文件移出 120s 快速失败列表 | 上游改该脚本或 streams 用例时保留 |
| `test/js/web/streams/streams.test.js` | 「Bun.file().stream() surfaces read() errors」四个用例：OHOS 沙箱拒绝读 `/proc/self/mem`（EACCES）而非 Linux 的 EIO → `eioCode = isOhos ? "EACCES" : "EIO"`（错误上抛路径不变） | 上游改这些断言时保留 |
| `test/bundler/bun-build-compile.test.ts` | 「compile with current platform target string」在 OHOS 需构造宿主目标串 `bun-<os>-<arch>-ohos`（`Libc::Ohos` 的 `-ohos` 后缀），否则被当作跨目标而触发下载 | 上游改目标构造时保留 |
| `test/js/bun/module-graph/module-graph-isolation.test.ts` | 「every property of Bun is classified」：新增 `Bun.ant` 后需在 pure 列表登记 `ant`；该文件的 fixture 需要 `mkfifo`（runner 已把 `/system/bin` 加进 PATH） | 上游给 `Bun` 加属性时同步登记 |
| `test/js/bun/util/filesink.test.ts` | 「writer() whose registration fails closes the dup exactly once」依赖 epoll `ADD` 报 EEXIST 失败，而 OHOS 的 `register_with_fd_impl` 已改为 DEL+重试（见上文 pty/epoll 修复）→ OHOS 跳过该用例 | 上游改 registration 语义时复评 |
| `test/cli/test/isolation.test.ts` | `--isolate` 泄漏 socket 子用例：子测试的自超时跟随 `ISOLATE_CLOSE_WAIT_MS` 预算（OHOS 20s + 5s），否则预算大于默认 5s 超时 | 上游改该子测试时保留 |
| `test/js/bun/gc/gc-controller-cadence.test.ts` | 两个「idle collection drops code」用例在 OHOS 放宽到 60s（需 `bun build --compile --bytecode` 100MB+ 并等待空闲 GC） | 上游改超时时保留 |
| `test/js/bun/spawn/spawn-ipc-gc.test.ts` | IPC 可回收用例 OHOS 放宽到 120s（负载下 8 次 spawn + GC 轮询） | 同上 |
| `test/regression/issue/02499/02499.test.ts` | 40 次 spawn+fetch：OHOS 预算 10s→25s、外框 30s→60s | 同上 |
| `test/cli/init/init.test.ts` | `bun init works` 与 `--yes` 回退用例 OHOS 预算 30s→90s（内嵌 `bun install` 在慢网络/负载下超时） | 同上 |
| `test/js/bun/spawn/spawn.test.ts` | `gcTick > pipe > should allow reading stdout` OHOS 放宽到 30s（50 次 spawn+读；连带 FORCE_WAITER 嵌套跑） | 同上 |
| `test/js/node/http/node-http-connect.test.ts` | node 侧用例在 OHOS 跳过（设备 node 对 `http://` 前缀 CONNECT 返回 500，CI node 返回 404）；Bun 侧 7 例保留 | 设备 node 版本变化时复评 |
| `test/js/third_party/body-parser/express-memory-leak.test.ts` | 三个 50,000 请求的泄漏检查用例在 OHOS 放宽 20s→60s（`isOhos ? 1000 * 60 : 1000 * 20`） | 上游改超时/请求量时保留 |
| `test/js/bun/spawn/spawn-stdio-syscall-error.test.ts` | 上游新增的「node:child_process: stdout emits 'error' before 'close'」断言在 OHOS 上对 `SPAWN_FAULT_RECV_AT=3`（消费者已挂载后再读）会竞态地得到 clean `end`：OHOS 以 raw read() 直排管道（T50），注入的 recv 故障可能不再出现。OHOS 下同时接受 `stdout.end` 与 `stdout.error:EIO`（close 顺序不变） | 上游改该断言时保留 |
| `test/js/node/net/node-net.test.ts` | 上游新增的「Socket fd adoption」4 个用例经 `openFifo` 调 `mkfifo`；设备 `/bin` 是 `/system/bin` 的软链，但裸 `bun test`（PATH 无 `/bin`/`/system/bin`）会 ENOENT（runner 会补 `/system/bin`）→ `isOHOS ? "/bin/mkfifo" : "mkfifo"` | 上游改 `openFifo` 时保留 |
| `test/js/bun/spawn/fixtures/fd-nonblock-probe.js` | 上游 #43814 新增的 `the ipc fd is blocking` 断言依赖 `/proc/self/fdinfo/<fd>`；OHOS 沙箱下该目录存在但条目读取报 ENOENT → 先探测可读性，失败则回退 `dlopen("libc.so.6")` + `fcntl(F_GETFL)`（实测 fd3 flags=2 → blocking，断言成立）。该 fixture 也被 `node/child_process/child-process-stdio.test.js` 使用 | 上游改 fixture 时保留 |
| `test/cli/install/bun-add.test.ts` | 两个 git URL 用例（含 SCP-style clone UglifyJS）OHOS 预算 20s→60s（慢网络/负载下单次 clone 已实测 30s+） | 上游改超时时保留 |
| `test/cli/hot/hot.test.ts` | `--hot` 的两个 sourcemap 用例在 OHOS 用 180s 预算且重载轮数 50→20（每轮走 `bun build --watch` + `--hot` 对，50 轮在负载下超 90s）；`should hot reload when a file is deleted and rewritten` 在 OHOS 接受 `reloadCounter >= 3`（负载下两条重载行会合并进同一次读取，循环可能越过 3） | 上游改这些用例时保留 |
| `test/cli/watch/watch.test.ts` | `should watch files`（含 non-ascii）OHOS 预算 10s→30s（11 次 watch 往返在慢设备上超过 10s） | 同上 |
| `test/cli/test/isolation.test.ts` | 文件默认超时 OHOS 30s→60s；`leaked outbound socket is closed before next file` 的 `ISOLATE_CLOSE_WAIT_MS` OHOS 20s→45s、该用例显式超时 120s（沙箱 TCP 拆除更慢） | 上游改 isolation 用例时保留 |
| `test/cli/test/parallel.test.ts` | `partitions by directory` 在 OHOS 允许 `firstDirs.size >= byPid.size - 1`（晚启动的 worker 可能复用目录）；`SIGTERM on coordinator` 的等待窗口 OHOS 200→1200 次（30s） | 同上 |
| `test/js/bun/module-graph/module-graph-isolation.test.ts` | fixture 的 “still running” 看门狗 3s→15s（OHOS 下 dispose 可超 3s）；`until()` 轮询 deadline 3s→15s | 上游改 fixture 时保留 |
| `test/regression/issue/32492.test.ts` | OHOS：并发 24→6、轮次 16→4、阈值 9s→12s、用例超时 120s→300s。实测单次 build 1.2s / 4 并发 3.7s / 6 并发 5.5s / 24 并发 18.2s（24 并发已越过 10s stall 底线，无法区分回归）；6 并发下健康轮 ~5.5s、stall（固定 10s idle-futex）~15.5s，12s 仍可区分 | 上游改该回归测试参数时复评 |
| `test/js/node/child_process/child_process.test.ts` | `it accepts stdio passthrough`（`bun install` npm-run-all + run-p）OHOS 30s→90s | 同上 |
| `test/js/bun/dns/resolve-dns.test.ts` | 无效主机名用例在 OHOS 接受 `EAI_AGAIN`（无可用 DNS 服务器时 getaddrinfo 先返回临时失败，而非 DNS_ENOTFOUND） | 上游改该断言时保留 |
| `test/js/bun/repl/repl.test.ts` | `waitFor` 5s→15s、`waitForScreen` 3s→10s（PTY 屏幕刷新在慢设备上超出原预算） | 同上 |
| `test/cli/install/bun-add.test.ts` | `git dep without package.json and with default branch`、`should handle Git URL in dependencies (SCP-style)` 在 OHOS 跳过（设备无法访问 github.com；原 60s 预算仍失败） | 设备可访问 github 时复评 |
| `test/cli/install/bun-install-registry.test.ts` | `bundledDependencies > git dependencies` 在 OHOS 跳过（fixture 解析 `git+ssh://git@github.com`，设备不可达） | 同上 |
| `test/cli/install/bun-link.test.ts` | 安装输出断言的时长后缀正则 `[0-9\.]+ms` 改为 `[0-9\.]+m?s`（慢设备上安装耗时以 `[N.NNs]` 输出，原正则剥不掉导致数组多一项） | 上游改这些断言时保留 |
| `test/cli/install/bunx.test.ts` | `setup()` 的 env 显式 `delete env.npm_config_user_agent`（Bun 仅在变量缺失时写入自己的 UA；调用方继承的 UA 会让 “set to bun” 断言失败） | 上游改 setup 时保留 |
| `scripts/ohos/run-all-official-progress-optimized.sh` | runner 的 `LD_LIBRARY_PATH` 补上 `/storage/Users/currentUser/.harmonybrew/lib`（内含 `libgcc_s.so.1`）：第三方预编译 `.node`（resvg、rollup-v4、astro、vitest）dlopen 报 `Error loading shared library libgcc_s.so.1`，补上后 4 项均通过 | 上游新增依赖预编译原生模块的第三方测试时保留 |
| runner 重试名单（2026-09-24 追加） | 追加 `module-graph-workers`、`module-graph`、`cli/test/bun-test`、`js/bun/http/bun-serve-file`（高负载下文件级超时；单跑均通过） | 同上 |
| `test/bundler/bun-build-compile.test.ts` | OHOS 上**被执行的二进制不可再写入**（`open()` → EPERM）：`a module whose bytecode the run did not use…` 与 `a payload record that does not check out` 改为把编辑写入**副本**并运行副本（`chmodSync 0755` 保持可执行）；`an order file that is a pipe`（`--bytecode-order=/dev/stdin`）在 OHOS 跳过（沙箱无 `/dev/stdin`） | 上游改这些用例时保留 |
| `test/regression/issue/026039.test.ts` | 无 DNS 时错误为 `DNSResolveFailed`（消息中无 registry URL）→ OHOS 接受该错误、跳过 URL 断言 | 设备可解析 DNS 时复评 |
| `src/sys/ohos_sign_io.rs`（运行时修复） | `has_elf_magic`/`read_file` 的 `openat` 会拿到**最低空闲编号**：当调用方关掉了自己的 fd 0/1/2 时，打开的签名目标落在该编号上，而 `FdExt::close` 与 `File` 的 Drop 都会**跳过 stdio 编号**（防误关 stdin/stdout/stderr）→ fd 永不关闭。改为 `open_above_stdio`（`openat` 后用 `bun_sys::move_above_stdio` 移到 ≥3 再返回）。上游 `spawn while fd 0,1,2 is closed` 13 个新用例由此转绿 | 上游改 `FdExt::close` 的 stdio 策略或该文件时复评 |
| `test/js/bun/test/test-test.test.ts` | 无效语法用例的时长归一化正则只处理 `[Nms]`，慢设备报告 `[N.NNs]` → OHOS 上先把 `[N.NNs]` 折成 `[xx ms]` | 上游改该快照时保留 |
| `test/js/bun/dns/resolve-dns.test.ts` | IPv6-only 查询在 OHOS 的两个 backend 都可能返回**无 code 的错误** → OHOS 统一接受 `DNS_ENOTIMP` 或 `undefined` | 设备支持 IPv6 时复评 |
| `test/js/node/http/node-http-req-complete.test.ts` | 「all tests pass in Node.js」对照用例在 OHOS 跳过：设备 node（v26.8.1）在本文件有 2 个 `res.end(chunk) after the client went away` 子测试失败，不能作为基准 | 设备 node 版本/行为变化时复评 |
| `test/cli/install/bun-install.test.ts` | 3 个网络依赖用例在 OHOS 跳过：`should handle Git URL with existing lockfile`、`should perform bin-linking across multiple dependencies`（registry 下载）、`should handle modified git resolutions in bun.lock`（克隆 github.com） | 设备可访问网络时复评 |
| `test/js/bun/shell/leak.test.ts` | `fd leak`/`mem leak` 的 100s 用例预算在 OHOS 负载下不足（多例 100.0s 超时）→ OHOS 提到 300s | 上游改预算时保留 |
| `scripts/build/config.ts`（构建适配） | 上游 #44091 新增「clang 与 rustc 的 LLVM 主版本必须一致」硬校验；OHOS 端钉死的 rustc 为 **LLVM 22.1.8**、OHOS SDK clang 为 **23.1.1**，且本环境无法更换 nightly → 在 OHOS 上豁免该检查（链接只读取 rustc 的**较旧** bitcode，新 lld 可读；且 OHOS 构建传 `--lto=off`） | 上游改该检查或 rust nightly 可升级时复评 |
| `test/internal/build-rust-toolchain-probe.test.ts` | 上游把探针 fixture 的 LLVM 版本改为 23.1.1 并要求 clang/rustc 一致；OHOS 端保留 `echo`（设备 `/bin/sh` 无 `printf` 内建）+ 取上游的 23.1.1 | 上游改 fixture 时保留 |
| `src/runtime/api/bun/spawn/stdio.rs` / `src/sys/lib.rs` | 上游 #44086「真实 #[cfg] 取代存根」重构：memfd 相关函数改为**函数级** `#[cfg(any(linux, android))]`（无存根）；OHOS 端采用其 cfg + 保留「OHOS 一律不可用 memfd」的提前返回（`Memfd` 变体加 `allow(dead_code)`） | 上游再改这些 cfg 时保留 OHOS 早退 |
| `src/spawn/process.rs` | 上游移除 Windows 存根（真实 cfg）；OHOS 端的 `prewarm()` 调用在 `#[cfg(target_env = "ohos")]` 块内 → 接受上游的删除 | 同上 |
| `test/internal/source-lints/dead-code-escape-limits.json` | 上游删除该 lint 与其清单（测试改为自算）→ 接受删除，不再维护 OHOS 版清单 | 上游恢复该 lint 时复评 |
| runner 看门狗（2026-09-26 追加） | module-graph 家族（`module-graph`/`-io`/`-compile`/`-workers`）WT 600→**900s**（单跑 2-3 分钟，全量高负载下多次超时）；重试名单再补 `module-graph-io`、`026039` | 同上 |
| `test/integration/bun-types/bun-types.test.ts` | 「isolated install with the global store」用例跑 fixture 的 `tsc`——`typescript@latest` 已是 **native（Go）编译器**，其运行时被沙箱 syscall 过滤器以 SIGSYS（`fanotify_init`）杀死 → OHOS 上跳过该 tsc 运行，保留 store 链接断言（该用例本体仍验证隔离安装 + 全局 store） | 上游改该用例时保留 |

**运行时缺陷（2026-09-20，已修复）**：在 PTY 终端的读取器仍活跃时执行
`Bun.Terminal.close()`（典型：`Bun.spawn({terminal})` → `kill()` → `await exited` → `proc.terminal.close()`），
内核侧对该 fd 的 epoll 注册会残留；下一次 PTY 的 fd 复用同一号码后，其 reader 注册无法收发数据
（子进程 `isatty(0/1/2)` 均为 true、能运行，但父端 `data` 回调永不触发）。两个场景的最小复现与
「先占住若干 fd 避免复用即可恢复」已验证。**修法**：`src/io/posix_event_loop.rs` 的
`register_with_fd_impl` 在 OHOS 下对 `epoll_ctl(ADD)` 的 `EEXIST` 先 `DEL` 再重试一次；
`tty.test.ts` 原样（含 kill+close）复测 **7/0 通过**，测试侧无需规避。

运行时配套（`src/jsc/bindings/BunProcess.cpp`）：OHOS 下 `process.report.getReport().sharedObjects`
改为解析 `/proc/self/maps` 上报已加载 `.so`。rollup/rolldown/@napi-rs/canvas 等包用它探测
musl（找 `ld-musl-*`）；为空数组时会误判 glibc 而加载不可运行的预编译包。该修复使
vite-build（rolldown-vite）与 pnpm（vite5→rollup）走 Linux musl 回退即可运行。

### 六-1、全量测试收集逻辑差异（OHOS 脚本 vs 上游 CI）——2026-08-12 记录

**结论：全量脚本 `run-all-official-progress-optimized.sh` 只跑 ~2025 个文件，而上游 CI 跑 5848 个，二者定义不同，非 bug。差异几乎全部来自 Node 官方测试目录。**

| 维度 | 全量脚本（OHOS） | 上游 CI（`scripts/runner.node.mjs`） |
|---|---|---|
| 收集方式 | `bun -e` 递归遍历（精确复刻上游 isTest/isHidden，受 `SKIP_VENDORED_NODE_TESTS` 控制） | 递归扫描 + 目录特判 |
| 匹配规则 | 仅 `*.test.ts/js/tsx/jsx/mjs/cjs/mts/cts` + `*.spec.ts/tsx/js/cjs/mjs/cts` | `isJavaScript`（`.js/.ts/.jsx/.tsx/.mjs/.cjs/.mts/.cts`）+ 文件名含 `.test` 或 `spec.`，**或** `isNodeTest`，**或** `isClusterTest` |
| node 官方测试目录 | ❌ **不收** | ✅ **整个目录都收**：`js/node/test/parallel/`（3658 个）、`js/node/test/sequential/`（85 个）、`js/bun/test/parallel/`（83 个） |
| 默认排除 | 无 | `integration/bun-types`（22 个）+ `internal/source-lints` |
| 文件数 | **~2132**（2026-09-12 全量） | **5848**（CI 实际运行 5826） |

**原因**：Node 官方测试用 `test-*.js` 命名（无 `.test` 后缀），默认的 `SKIP_VENDORED_NODE_TESTS=1` 口径排除它们。OHOS 上测试比 Linux 慢 5-10x（7/21 全量：1868 files / 01:31:24 / 92 timeouts），加入 3658 个 node parallel 测试将使时长增至 5-6 小时且大量已知失败，故**有意排除**。

**若需完全对齐 CI**：把 3 个 node 目录加入 find（`-path "test/js/node/test/parallel/*"` 等），但 OHOS 上显著变慢。

---

## 六-2、无 LD_PRELOAD shim 行为矩阵（2026-09-16）

旧 `ohos_compat_shim.c`（LD_PRELOAD 符号 interpose）已删除。"完整去 shim"后每个曾由它补偿的行为都有源码级实现或确认无需；上游改动相关代码时查此表：

| 旧 shim 行为 | 现在由谁承担 | 守护测试 |
|---|---|---|
| `linkat` 硬链接回退 | `bun_sys::linkat` 的 `linkat_copy_fallback`（OHOS 字节复制） | `test/js/bun/util/ohos-fs-fallbacks.test.ts` |
| `symlinkat` | 设备原生支持（无需回退） | 同上 |
| `close_range` / `syscall` | `bun_close_range` 在 OHOS 返回 ENOSYS，调用点 `#if !defined(__OHOS__)` 走 close 循环 | spawn/fd 相关用例 |
| `fchmodat2`(452) | `sys/lib.rs` lchmod → `SYS_fchmodat` | node-gyp lifecycle |
| `getpwuid_r` | `ohos_node_userinfo`（注入 + `$USER/$LOGNAME` 回退）；遗留 `OHOS_COMPAT_SHIM_DISABLE` 开关已删除 | `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` |
| `getcwd` | `bun_core::cwd_is_deleted_ohos`（`/proc/self/cwd` 探测） | deleted-cwd 用例 |
| `getaddrinfo` | 原生 DNS（loopback/ADDRCONFIG 对齐，T49） | T49 相关用例 |
| `tmpfile` | 启动期 `TMPDIR` 回退（`bin_entry`） | install 用例 |
| `splice` | 全仓无调用点，不需要 | — |
| `epoll_ctl`/`epoll_pwait`/`poll`/`ppoll`/`epoll_pipe` | T50 原生 workaround：multi_run drain / `deinit_poll_keep_fd` / `tick_without_idle`、Terminal `EPOLL_REARM_WATCH` + watchdog **force-drain**（100ms 强制喂读，见 §三-1）+ Terminal 关闭前 flush + 初始空 writer 解注册、PipeWriter storm 检测 | `multi-run`、terminal 套件 |
| `close` | 仅 shim 内部簿记 | — |

## 七、merge 上游时的检查清单（按优先级）

### 🔴 必须人工验证（历史冲突/高风险）
1. **multi_run.rs** —— 上游每改一次都需重测 `multi-run.test.ts`（120+ 用例）+ 手动 parallel/sequential
2. **spawn_process.rs memfd 门控** —— 上游若改 memfd 逻辑，OHOS 必须禁用（uses-what-bin-slow SIGABRT 回归）；同文件的 sync wait 循环另有 no_orphans pidfd 父监视（见 §三）
3. **sys/lib.rs lchmod** —— 上游若改 lchmod，OHOS 回退 chmod 必须保留（node-gyp 测试）
4. **PackageManagerLifecycle.rs PATH 注入** —— OHOS 前置 bun_dir/node_dir 必须保留（lifecycle 测试 PATH="" 场景）
5. **run_command.rs IS_NODE_ARG** —— `bun node` 支持（as-node 测试 11 个）
6. **webkit.ts** —— 上游版本号升级需重新构建验证；上游 cmake 改动需检查 OHOS 块；WebKit 另由 `patches/webkit/suspend-resume.patch` 打 OHOS 挂起/恢复加固（bump 后确认补丁仍能应用，见 §二）

### 🟡 需检查（OHOS 门控存在但上游少动）
7. MiniEventLoop.rs `tick_without_idle` pub 可见性
8. filter_run.rs drain —— 2026-09-17 按 multi_run 补齐 T50 直读（见 §三 filter_run 行）；上游改 drain 逻辑时复测 `--filter/--workspaces`
9. MessagePort leak fix、highway SVE、V8Array、**c-bindings 两阶段 execve 握手 + `is_executable_file`（见 §五）**
10. sys/lib.rs fstat/statx/getcwd/link
11. **工具链（LLVM/Rust nightly）** —— 上游 bump 时：`scripts/build/tools.ts` 的 `LLVM_VERSION_RANGE` 是硬约束（当前 `>=23.1.0 <23.1.99`），需要 brew 提供对应 LLVM（当前 llvm 23.1.1 + keg-only lld 23）；Rust 仍由脚本 `RUST_VER`/`RUST_HOME` 钉在 `nightly-2026-07-20`，与 `rust-toolchain.toml` 的 channel 解耦；`src/collections/*` 的 nightly 兼容层（`core_intrinsics`）保留，不随上游迁移到 `type_info` API；`core::alloc::AllocatorClone`（#44361 使用，core 于 `nightly-2026-09-15` 新增）在钉定 nightly 不存在 → `src/bun_alloc/MimallocArena.rs` 的 impl 以 `#[cfg(not(target_env = "ohos"))]` 门控（`833e8568ab`）——上游再引入同类新 nightly API 时按此模式门控

### 🟢 冲突概率低（上游不常动）
12. ffi_body 系统路径、node_fs link、PackageManager CC/CXX、其余

## 八、验证命令（merge 后必跑）

```bash
# 构建（脚本含 configure + 签名）
./scripts/ohos/build-bun-ohos-native.sh

# 核心回归（部署到 all-tests 后）
bun test test/cli/run/multi-run.test.ts            # 120+ 用例
bun test test/cli/run/as-node.test.ts              # 11 用例
bun test test/cli/install/bun-install-lifecycle-scripts.test.ts -t "node-gyp"  # 17 用例
# uwbs repro（memfd）
PATH="" bun install --no-save  # uses-what-bin-slow 场景
```

---

## 九、历史冲突记录（merge 教训）

| 上游 commit | 冲突 | 解决 |
|---|---|---|
| #37286 multi-run EOF fix | multi_run/filter_run drain_and_close_pipes | OHOS 分支同步 drain + force-end（不能整体跳过——detached 卡死；不能只 deinit——输出丢失） |
| #37228 WebKit bump | webkit.ts 无 OHOS 支持 | 保留 OHOS cmake 块 + 更新版本号；WebKit 源码用上游干净版 |
| c26e9d0aea c-bindings close_range | `#if` 块闭合 | 保留本地补丁 |
| `fd8422ce47..367d939d9a`（12 提交，2026-09-19） | `test/cli/install/bun-update-transitive.test.ts`（上游新增 OUTAGES helper 并把用例改回 concurrent vs 我们的串行适配）；`test/js/bun/gc/gc-controller-cadence.test.ts`（imports：上游新增 afterAll/readFileSync/isWindows/join）| ① 取上游内容后重新应用「concurrent→串行」（文件内 concurrent 数归 0）② imports 取并集并保留 `isOhos`（skip 保留，行 506）③ **完整影响集 10 文件**（`src/runtime/node/node_net_binding.rs`、`src/runtime/socket/Listener.rs`、`src/runtime/socket/socket_body.rs`、`src/standalone_graph/StandaloneModuleGraph.rs` + 6 个测试）逐一校验：post-merge diff == 上游 diff（行数相等）、OHOS 标记数不变 |
| `9b7c98287f..fc297d4658`（6 提交，2026-09-20，含 spawn 信号命名 #39970、CI 脚本 TS 化 #43595） | `scripts/build/rust.ts`（上游 TS 化只改注释 `ci.mjs→ci.ts`，本地在同处新增了 `rustCanCrossFromLinux`）；`test/js/bun/shell/shell-hang.test.ts`（上游新增 `isLinux` 信号用例 vs 本地 `isOhos` 超时放宽）；`test/js/bun/terminal/terminal-platform-gaps.test.ts`（上游新增 `windowsBuild` 鼠标追踪用例 vs 本地 pty 软跳过）| ① rust.ts 保留本地函数、只取上游注释改名 ② shell-hang import 取并集 `{ bunRun, isLinux, isOhos }` ③ terminal 保留全部 `isOHOS` 软跳过并合入上游鼠标用例 ④ 影响评估：21 个双方文件本地新增行 100% 保留、108 个仅上游文件与上游逐字节一致、285 个 OHOS 文件 `ohos` 标记数零变化 ⑤ 构建期发现 `stream.ts` 管道背压丢输出/崩溃并修复（见 §二）|
| `fc297d4658..a2b69f7b06`（14 提交，2026-09-21，含 Rust 每-crate 边 + 直链 rlibs #41854/#43650、WebKit bump #43616） | `scripts/build/{rust.ts,bun.ts,config.ts,flags.ts,build.ts}`（上游大重构 vs 本地 OHOS 分支）；`src/runtime/webcore/blob/read_file.rs`（上游 `on_ready` 可见性）；`test/bundler/bun-build-compile.test.ts`（imports）；`test/internal/source-lints/dead-code-escape-limits.json` | ① 构建文件以上游新结构为基、重放 OHOS 改动（rustTriple/cpu/linker env；config 的 ohos 解析块并入 `resolveBase`/`resolveConfig`；flags 的 OHOS 编译/链接块；build.ts 的 `configFlags` 加 4 个 ohos 字段）② read_file 保留读循环串行化、取上游 `pub(crate)` ③ bun-build-compile imports 取并集 ④ 构建期修复：`bun.ts` export-list 门控加 OHOS、OHOS 导出块改用 `exports.list`（`symbols.dyn` 已删）、6 处 rlib-only lint（`pub(crate)`/cfg 门控/allow）⑤ 完整影响评估：468 个仅上游文件与上游逐字节一致、OHOS 标记仅 2 处有意变化（新增/移除注释）⑥ 重点回归 30 项全通过（2 项需 runner 的 `LD_LIBRARY_PATH` 或复跑）|
| `a2b69f7b06..bf80d21c69`（30 提交，2026-09-22，含 event loop 去掉 ManagedTask #43675、空闲 GC 收尾 #43681、node:net 写失败/关闭 #43755/#43698、napi 外部缓冲终结器 #43757、streams #43752/#43714、fetch 背压/中止 #43743/#43699、node:http socket 事件 #43708、node:tls #42176、WebSocket TLS #43672、HMR #33196、mordant lint #43664/#43680/#43700/#43718、WebKit bump 到 `564ac2a6cad8`） | `packages/bun-usockets/src/eventing/epoll_kqueue.c`（上游 `Bun__JSC_onBeforeWait` 新增 `released_heap_access` 出参 + `Bun__JSC_acquireHeapAccessAfterWait` + `loop->current_ready_poll = 0`，与本地删除的 mimalloc scavenger 交接块同处）；其余 12 个双方文件自动合并 | ① epoll_kqueue：保留本地「无 mimalloc scavenger 交接」（`handed_off` 已不存在），取上游新堆访问握手与批次清理 ② 完整影响评估：162 个仅上游文件与上游逐字节一致、279 个仅本地文件与本地父提交逐字节一致、13 个双方文件本地/上游新增行 100% 保留 ③ 构建 1415/1415 成功（WebKit 新 commit 经 partial clone 增量拉取）④ 构建后发现 node-net 新用例的 `mkfifo` PATH 问题并适配 |
| `bf80d21c69..6d504dd983`（18 提交，2026-09-23，含 spawn 阻塞 IPC fd/dup2 槽位 #43814、node:fs 原生完成回调 #43728、tls 握手前写入/坏链拒绝 #43766/#43767、streams ERR_INVALID_THIS #43758、FileSink 析构 #43729、buffer.transcode 2GiB #42875、node:vm 动态导入生命周期 #43724、s3 上传中止 #41688、Bun.Image JPEG 警告 #43812、WebKit bump 到 `299c5323879e`） | `test/js/bun/spawn/spawn.test.ts`（双方都在文件末尾追加：本地 `stdin ownership` 测试 vs 上游 #43814 的 `runInFreshProcess` + fd 槽位测试）；其余 9 个双方文件自动合并 | ① spawn.test.ts 冲突保留双方新增块（本地 stdin ownership + 上游新测试）② 完整影响评估：94 个仅上游文件与上游逐字节一致、282 个仅本地文件与本地父提交逐字节一致、10 个双方文件本地/上游新增行 100% 保留 ③ WebKit 新 commit 经 partial clone 增量拉取；构建 1416/1416 成功 ④ 构建后发现上游新 fixture `fd-nonblock-probe.js` 的 `/proc/self/fdinfo` 假设在 OHOS 不成立并适配（fcntl 回退） |
| `36cd1514ec..a4f1429148`（5 提交，2026-09-27，含 #44091 clang 与 rustc 的 LLVM 主版本必须一致、#44086「真实 #[cfg] 取代存根/占位」、#44057 process.exit 调整、2 个测试改动） | `src/runtime/api/bun/spawn/stdio.rs`、`src/sys/lib.rs`（memfd 相关函数级 cfg vs 本地 OHOS 早退/存根）、`src/spawn/process.rs`（上游移除 Windows 存根 vs 本地 `prewarm`）、`src/runtime/webcore/blob/read_file.rs`（读循环串行化）、`test/internal/build-rust-toolchain-probe.test.ts`（echo + 23.1.1）、`dead-code-escape-limits.json`（上游删除，接受） | ① stdio.rs/sys/lib.rs：采用上游函数级 `#[cfg(any(linux, android))]` + 保留「OHOS 一律不使用 memfd」提前返回（`Memfd` 变体加 `allow(dead_code)`）② spawn/process.rs：接受上游删除 Windows 存根（本地 `prewarm()` 调用在 `#[cfg(target_env="ohos")]` 内）③ read_file.rs：保留本地读循环串行化块 ④ toolchain 探针：保留 `echo`（设备 sh 无 printf）+ 取上游 23.1.1 ⑤ **构建期发现**：上游新增 LLVM 主版本一致性硬校验会拒绝本环境（rustc LLVM 22.1.8 vs SDK clang 23.1.1）→ OHOS 豁免；上游移除 `join` 导入导致本地 ICU 链接块 `ReferenceError: join is not defined` → 补回导入 ⑥ 完整影响评估：282 个仅上游文件逐字节一致、254 个仅本地文件逐字节一致；5 处双方文件差异均为上述**有意**解决（cfg 重写/存根移除/JSON 删除），已逐项复核 |
| `a4f1429148..11c41c645d`（18 提交，2026-09-29，含子进程 stdout/stderr 清 O_NONBLOCK #43868、PipeReader 失败后不再读该 fd #43900、FileSink 存活到 on_close #43761/#44250、usockets TLS 握手暂停 #42351、uws 分离请求头 #44210、node:http 隧道/监听/失败连接 #44205/#44032/#44191/#44243、minify 固定符号名 #41174、expect.any 链 #34646、BunString 空错误 #40556、`Bun.stripANSI` #42929、`--disallow-code-generation-from-strings` #44171、bun-types undici-types #43668） | `src/io/PipeReader.rs`（bit 11 两方撞车：本地 `EPOLL_REARM_WATCH` vs 上游 `READ_FAILED`）、`src/io/PipeWriter.rs`（`try_write` 重构：上游 RWF_NOWAIT 快速路径 + `rwf_unsupported` vs 本地 OHOS `ensure_pipe_expanded`/`pipe_size_set`）、`src/io/posix_event_loop.rs`（枚举尾部两变体相撞：本地 `EpollRearmWatch` vs 上游 `Tty`）、`src/sys/lib.rs`（本地 `read_nonblocking`/`write_nonblocking` 被上游改名为 `read_nowait`/`write_nowait`，返回 `Maybe<Option<usize>>`）、`test/js/bun/util/filesink.test.ts`（imports 并集） | ① PipeReader：上游 `READ_FAILED` 保留 `1 << 11`，本地 `EPOLL_REARM_WATCH` 退到 `1 << 12`（`u16` 有余量）② PipeWriter：取上游新 `try_write` 结构，OHOS `ensure_pipe_expanded()` 钩子移入 `FileType::Pipe if !force_sync` 分支；`pipe_size_set` 与 `rwf_unsupported` 双保留 ③ posix_event_loop：两变体都保留（`Tty` + `EpollRearmWatch`）④ sys/lib：采用上游 `read_nowait`/`write_nowait`（调用方按 `Ok(None)` 回退普通路径），把本地观察到的 `ESPIPE` 并入其 per-call `Ok(None)` 集合 ⑤ 完整影响评估：84 个仅上游文件逐字节一致、287 个仅本地文件逐字节一致；15 个双方文件中 5 处差异均为上述**有意**解决，已逐项复核 ⑥ 编译 1416/1416 成功；定向回归 filesink 77/0、console-write 5/0、process 187/0、test-test 40/0、bun-write 86/0、node-http 264/0、node-http-connect 83/0、node-tls-connect 104/0、net/socket 110/0、serve 330/0、bun-types 22/0 ⑦ **测试适配**：bun-types 全局 store 用例的 `tsc` 为 native（Go）编译器，OHOS 沙箱 SIGSYS（`fanotify_init`）→ 跳过该 tsc 运行、保留 store 断言（`96b4acd351`） |
| `11c41c645d..5a183c1ebc`（7 提交，2026-10-01，含 dead realm 延迟工作取消修复 #44279（node:vm / `bun test --isolate` 段错误）、node:http server socket 授予 #44217、`Bun.serve` If-Range #43571、sql begin/COMMIT ROLLBACK 标签 #35119、sql BunFile `tls` 作 CA #41761、css 重复规则索引 #42948、require 缓存已移除条目 #42311） | **0 冲突**（自动合并；3 个双方文件改动区域错开：`DirectoryRoute.rs` 本地 openat2 OHOS 校验 vs 上游 `RangeRequest`/If-Range 签名；`vm.test.ts` 本地 OHOS skip vs 上游尾部新增 2 个 dead-realm 用例；`adapter-env-var-precedence.test.ts` 本地 socket 路径 vs 上游新增 tls-BunFile describe） | ① 完整影响评估：36 个仅上游文件逐字节一致、299 个仅本地文件逐字节一致、3 个双方文件本地/上游新增行 100% 保留（**0 差异**）② 编译 1409/1409 成功（`src/jsc/bindings/*.h` 变更触发 JSC 重建）③ 定向回归：vm 374/0（含 2 个新 dead-realm 用例）、tls-sql 3/0、adapter-env-var-precedence 94/0、node-http-displaced-response 20/0、require 17/0、require-extensions 21/0、bun-serve-file 176/0、serve-directory-routes 32/0、css duplicate-declaration 5/0、node-http 264/0、multi-run 127/0、isolation 41/0、as-node 11/0、node-gyp 17/0（`sql-begin-commit-rolled-back` 为 `describeWithContainer("postgres")`，设备无容器运行时→0 用例跳过，属正常）④ spawn.test.ts 在高外部负载下偶发挂起（非本轮改动区；重跑验证） |
| `5a183c1ebc..9d9fdbe862`（5 提交 + WebKit bump，2026-10-01 下午，含 React Fast Refresh 方法内 hook 崩溃 #44345、FileSystemRouter 绝对路径含 `..` 崩溃 #44342、dev server 未解析导入重复导入越界 #44340、`pm ls --all` 超 512 字节解析 #38616、模块移除时 `import()` 在途崩溃 #44281；**WebKit 升级** `f20ce774455 → fb1167ebf2c`（#748 `[[LoadedModules]]` 与注册表同步、#749 getrandom(2) 读取 OS 随机数）） | `test/cli/hot/hot.test.ts`（imports：本地 `isOHOS` vs 上游 `tempDir`）| ① 冲突 1 处：imports 取并集（保留 `isOHOS`；本地 180s 预算/20 轮适配行均在）② 完整影响评估：13 个仅上游文件逐字节一致、300 个仅本地文件逐字节一致、2 个双方文件新增行保留（`webkit.ts` 47+1 行；`hot.test.ts` 仅 import 并集处 1 行有意改写→ 0 实质差异）③ WebKit 检出切到 `fb1167ebf2c`（partial clone 增量：仅 2 提交）④ 编译 1408/1408 成功（含 JSC 重建）⑤ 定向回归：filesystem_router 36/0、bun-pm 23/0、mock-module 26/0、plugins 49/0、bundler_jsx 69/0、bake dev html 12/0、hot 13/0（含 #44281 新用例）、as-node 11/0、node-gyp 17/0、multi-run 127/0 |
| `9d9fdbe862..37471e585e`（2 提交，2026-10-01 傍晚，含 tls：包装 Duplex 在 TLS 引擎建立前的 EOF/close #44196、`console.write` 回退到 #43649 之前实现 #44351） | **0 冲突**（自动合并；唯一双方文件 `src/runtime/socket/socket_body.rs` 区域错开：本地 `pending_fatal_send_errno` 闩锁 vs 上游 `DuplexUpgradeContext` 错误路径/`finish_close`） | ① 完整影响评估：5 个仅上游文件逐字节一致、301 个仅本地文件逐字节一致、1 个双方文件（`socket_body.rs` 本地 48 + 上游 8 行）新增行 100% 保留，**0 差异** ② 编译 1408/1408 成功（约 20 分钟）③ 定向回归：console-write 6/0、net/socket 110/0、node-tls-connect 139/0（新增 35 用例）、tls-duplex-close-throw-uaf 4 skip（仅 ASAN/debug 运行，release 预期跳过）、as-node 11/0、node-gyp 17/0、multi-run 127/0、spawn 187/0 ④ 备注：spawn 在高外部负载下偶发整文件挂起（重跑 110s 通过），与本轮 tls/console 改动无关 |
| `37471e585e..4b02e1031d`（1 提交，2026-10-01 夜，含 `--hot` 入口点 promise 的 UAF 修复 #44350：`VirtualMachine.rs`/`jsc_hooks.rs`/`hw_exports.rs` 改为持有入口 promise） | **0 冲突**（自动合并；2 个双方文件区域错开：`hot.test.ts` 本地顶部适配 vs 上游尾部新增堆快照用例；`module-graph-isolation.test.ts` 本地适配 vs 上游 `response-bodies-of-disposed-graphs.mjs` fixture 的 `before/after` 计数） | ① 完整影响评估：4 个仅上游文件逐字节一致、300 个仅本地文件逐字节一致、2 个双方文件新增行 100% 保留（`hot.test.ts` 25+100、`module-graph-isolation` 112+4），**0 差异** ② 编译成功（Rust 改动，约 20 分钟）③ 定向回归：timer-gc-roots 10/0、hot 16/0（含 #44350 新堆快照用例）、module-graph-isolation 413/0、multi-run 127/0、isolation 41/0、as-node 11/0、node-gyp 17/0 |
| `4b02e1031d..f4d755a9cf`（1 提交，2026-10-02，usockets「socket holder 只被通知一次」#44327：`packages/bun-usockets/src/*` + `src/jsc/bindings/*` + net/sql/valkey/h2 共 32 文件） | `test/js/node/net/node-net.test.ts`（imports：本地 `isOHOS` vs 上游 `isMusl`）| ① 冲突 1 处：imports 取并集（`isMusl` + `isOHOS` 都保留）② 完整影响评估：26 个仅上游文件逐字节一致、296 个仅本地文件逐字节一致、6 个双方文件新增行 100% 保留，**0 差异** ③ **构建插曲**：首次编译因设备文件系统满（98%）失败；清理 `build/release-ohos`、`build/ohos-release`、`build/ohos-release-lto` 三个 9-11 的旧实验变体（约 19GB，脚本/文档均无引用）后编译成功 ④ 定向回归：node-net 127/0、connect-autoselectfamily-stale-timer 2/0、net/socket 110/0、serve 330/0、node-http 264/0、sql-close-pending 14/0、tls-sql 5/0、valkey-gc 20/0、isolation 46/46、multi-run 127/0、as-node 11/0、node-gyp 17/0 ⑤ **新增测试适配**（`4ee47385cd`）：isolation 的 3 个 redial 用例在全文件并发下超时/断连——内层 fixture 超时 5s→30s（OHOS）；Redis `first` 客户端默认 10s `connectionTimeout` 在父进程 mock 服务被 40+ 并发子进程拖慢时不够→60s。**对照验证**：旧二进制（`3cc217ea`）跑同一测试文件反而 42/4 失败（含泄漏检查失败——正是本提交修复的行为），确认 Redis 断连为环境/负载固有而非本轮回归 |
| `f4d755a9cf..468efacace`（2 提交，2026-10-02，含 `bun build` 移除死旗标 `--dump-environment-variables` #44370、fetch 解压按 RFC 1950 头决定 zlib/raw deflate #33711） | **0 冲突**（自动合并；2 个双方文件区域错开：`context.rs` 本地 `TestOptions` ASAN 默认超时 vs 上游删 `dump_environment_variables` 字段；`fetch-http2-client.test.ts` 本地 env 清理 vs 上游新增 h2 deflate 用例） | ① 完整影响评估：8 个仅上游文件逐字节一致、300 个仅本地文件逐字节一致、2 个双方文件新增行 100% 保留（`context.rs` 6+0、`fetch-http2-client` 40+34），**0 差异** ② 编译成功（约 25 分钟）③ 定向回归：fetch-gzip 89/0（含新增 deflate 用例）、fetch-http2-client 76/0（含新 DATA 帧单字节用例）、multi-run 127/0、as-node 11/0、node-gyp 17/0；测试中无 `dump-environment-variables` 引用 |
| `468efacace..aa8307619d`（25 提交，2026-10-03，含 **WebKit bump `1600131e46b5`** #44500、tls 六连（FIN/握手/包装 Duplex/session #43962 #42350 #43957 #37664 #44290、macOS DNS #44519）、HTMLRewriter 生命周期 #43379、bundler（import 位置 #44508、`--sourcemap` 段错误 #44502）、bun test（`--coverage-reporter` #44469、深层打印 #44353、非对称匹配 #44348）、install manifest 等待者 #44414、node:http 角色位 #44447、glob 目录名连续字节校验 #41985、structured clone 传输表 #37966、resolver 单次解析 #44473、Blob slice 流 #38685、buffer 非字符串 #43452、timers promisify #44285） | `test/js/bun/glob/scan.test.ts`（imports：本地 `isOhos` vs 上游 `isLinux`）；上游删除 `src/jsc/PluginRunner.rs`（本地零引用，接受） | ① 冲突 1 处：imports 并集（`isLinux` + `isOhos`，两者都在用）② 完整影响评估：107 个仅上游文件逐字节一致、291 个仅本地文件逐字节一致、11 个双方文件新增行全保留（仅 scan.test.ts 的 import 并集为有意改写），**0 差异** ③ WebKit 检出切到 `1600131e46b5`（增量 1 提交）④ 编译 1412/1412 成功 ⑤ 定向回归：node-tls-connect 174/2skip/0（适配后）、duplex-end-verify 68/0、renegotiation 21/0、resolve-dns 101/0、scan 206/0、net/socket 118/0、plugins 96/0、resolve 99/0、expect 424/0、inspect 96/0、node-http 284/0、buffer 719/0、bun-test 110/0（适配后）、blob 147/0、body-clone 100/0（适配后）、structured-clone 244/0、worker-postmessage 7/0、html-rewriter-leak 50/0、multi-run 127/0、as-node 11/0、node-gyp 17/0、spawn 187/0 ⑥ **测试适配**（`9ffaf73791`、`f7db5f6c9c`）：tls 设备 node 对 `{socket, session}` 不复用 → node 侧该用例跳过；bun-test 归一化接受 `[N.NNs]`（慢设备总时长为秒）；body-clone 的 `/proc/sys/kernel/ostype` 在设备上是 `HarmonyOS\n`；runner 重试名单加 `node-tls-connect`（公网 bun.sh 用例全文件负载下偶发 ECONNRESET，单跑 10/0）。**对照验证**：bun-test 两处快照失败在上一轮二进制上同样复现（设备慢导致），非本轮回归 |
| `aa8307619d..c7b06d94ba`（4 提交，2026-10-04，含 **mimalloc ×2**（`eab09015a585→92ef6587c57b`，v3.5.3 + `Bun.sleepSync` 归还内存 #44560/#44575）、**WebKit bump `1600131e46b5→5718a6ec579b`**（idle JSC 线程与 `Atomics.wait` 归还内存 #44564，WebKit #768 gc-memory-return）、docker 内联签名密钥 #4450x） | `packages/bun-usockets/src/eventing/epoll_kqueue.c`（上游**修改** scavenger 交接块 vs 本地 7 月移除）、`scripts/build/deps/webkit.ts`（版本行）、`src/runtime/api/BunObject.rs`（sleepSync 归还内存 vs 本地 1 行） | ① 冲突 1 处：**完整采用上游的 scavenger 集成**——恢复被改的交接块（`handed_off = will_idle_inside_event_loop && mi_on_thread_idle_start()`）+ 一并恢复流内 `#include <mimalloc.h>` 与轮询后的 `mi_on_thread_idle_end()`（7 月「OHOS 缺 mimalloc 头」的移除已无必要：`libusockets.h` 正常路径已包含 `mimalloc.h`、vendor 提供实现）；该文件现与上游逐字节一致 ② 完整影响评估：10 个仅上游文件逐字节一致、302 个仅本地文件逐字节一致、3 个双方文件全保留（`epoll_kqueue.c` local_adds=0、`webkit.ts` 47+1、`BunObject.rs` 1+6），**0 差异** ③ WebKit 检出切 `5718a6ec579b`（增量 1 提交）④ 编译成功 ⑤ 定向回归：sleepSync 6/0、atomics 30/0、timer-gc-roots 10/0、compile-rss 1/0、net/socket 118/0、isolation 46/0、serve 330/0、multi-run 127/0、as-node 11/0、node-gyp 17/0、spawn 187/0（首次高负载下整文件挂起，重跑 82s 通过——与既往负载型瞬时一致）|
| `c7b06d94ba..d4928764f2`（1 提交，2026-10-05，fetch：TLS 每连接建立一次而非每请求 #44507） | `test/js/web/fetch/fetch.tls.test.ts`（imports：本地 `isOhos` vs 上游 `nodeExe`）| ① 冲突 1 处：imports 取并集（`isOhos` + `nodeExe`，两者都在用：isOhos 在 1537 行的阈值、nodeExe 在上游新增的 peer fixture 用例）② 完整影响评估：4 个仅上游文件逐字节一致、303 个仅本地文件逐字节一致、1 个双方文件（本地 4 + 上游 69 行）保留，仅 import 并集 1 处有意改写，**0 实质差异** ③ 编译成功 ④ 定向回归：fetch.tls 63/0（含 TLS 每连接新用例）、multi-run 127/0、as-node 11/0、node-gyp 17/0 |
| `d4928764f2..5749c31290`（9 提交，2026-10-08，含 **`bun check` 内置 TS 类型检查器**（#44361 新 `src/sema` crate + `src/js_parser/sema/*` + CLI `typescript_libs.bin`；#44665/#44685 差异修复）、**WebKit bump `5718a6ec579b→0c06faadf65b`**（fork PR #773，上游 WebKit `dbdca7545d`；`CString→UTF8CString` 迁移）、spawnSync 隔离事件循环 #44581、sql mysql #43323、sql postgres #44235、ByteStream 生产者错误 #38003、React Fast Refresh 签名 #43750） | `src/jsc/bindings/BunProcess.cpp`（上游 UTF8CString vs 本地 OHOS dlopen 签名）、`src/resolver/resolver.rs`（上游 `load_tsconfig` 重构 vs 本地 EACCES/EPERM）、`test/js/bun/spawn/spawn-pipe-start-error.test.ts`（imports） | ① 冲突 4 处：BunProcess 取上游 `legacyCStringPointer()` + 保留 `ohos_ensure_elf_signed`；resolver 取上游结构 + 在 `load_tsconfig` 重放 `is_not_found_like`；测试 imports 取并集 ② 完整影响评估：312 个仅上游文件逐字节一致、277 个仅本地文件逐字节一致、27 个双方文件新增行仅 4 处**有意改写**（0 实质差异）③ WebKit 检出切 `0c06faadf65b` ④ **构建期修复**：`core::alloc::AllocatorClone`（#44361 使用，core 于 `nightly-2026-09-15` 新增）在钉定 `nightly-2026-07-20` 不存在 → `#[cfg(not(target_env = "ohos"))]` 门控（`833e8568ab`）；编译 1409/1409 成功 ⑤ **测试适配**（`2b6540b2b6`）：spawn-pipe-start-error 的 9 个 `FAIL_EPOLL_CTL=pidfd-add` 注入用例在 OHOS（waiter thread 默认开、不注册 pidfd）不可注入、2 个阻塞 300s → 2 块 `skipIf(isOHOS)` + 2 块过滤 pidfd 条目；重跑 15 pass/8 skip/0 fail（12s）⑥ 定向回归：spawn 175/0（首批批次被外部中断，重跑 89s 通过）、spawnSync 16/0、isolated-loop 7/0（首批 6/1 为负载抖动）、webkit-upgrade 9/0、atomics 30/0、timer-gc-roots 10/0、fetch.tls 62/0、net/socket 110/0、serve 328/0、fetch.stream 121/0、body-mixin-errors 23/0、serve-stream-body-error 33/0、sql-mysql 9/0、sql-postgres 2/0、react-spa 8/0、**check entry-points 470/0**、multi-run 127/0、as-node 11/0、node-gyp ✓ |

> **合并教训（2026-10-08，terminal 返回值）**：`Terminal::write` 的返回值映射在早期合并中被回退为 #34289（2026-07-15）之前的"按 arm 返回同步刷出量"；上游语义是**非错误路径返回输入全长**（`StreamingWriter::write` 已缓冲尾部，见该文件内注释）。设备上表现为两个 terminal 用例长期失败（drain 第二写 5005、PTY 满写 13824），且在旧二进制上同值复现，极易被误判为设备噪声。修复：恢复 `_ => Ok(js_number(bytes.len()))`（`d14eb3504a`）。**今后合并 `Terminal.rs` 时逐行核对该 mapping**；terminal 套件失败先对照上游语义而非默认怀疑设备。
