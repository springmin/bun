# build-ohos.yml 迁移到新 WebKit Artifact 的修改方案

**基于**: WEBKIT_ARTIFACT_COMPARISON.md 分析  
**旧 artifact**: `bun-webkit-ohos-aarch64-release.tar.gz` (65MB, 包含冗余构建文件)  
**新 artifact**: `webkit-ohos-aarch64-Release.tar.gz` (21MB, 干净的 lib+Headers)

---

## 主要结构差异

| 特征               | 旧 artifact                                                                                           | 新 artifact                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **压缩包内结构**   | `Release/lib`<br>`Release/JavaScriptCore/PrivateHeaders/`<br>`Release/WTF/Headers/`<br>`icu-headers/` | `lib/`<br>`Headers/JavaScriptCore/`<br>`Headers/WTF/` |
| **ICU 头文件**     | ✅ 包含完整 `icu-headers/` (203 files)                                                                | ❌ 不包含 (需从源码编译)                              |
| **DerivedSources** | ✅ 包含 (不应分发)                                                                                    | ❌ 排除                                               |
| **构建系统文件**   | ✅ 包含 (CMakeFiles, build.ninja)                                                                     | ❌ 排除                                               |

---

## 需要修改的步骤

### 1. Download prebuilt WebKit (步骤 98-106)

**旧代码**:

```yaml
- name: Download prebuilt WebKit
  run: |
    mkdir -p vendor/WebKit/WebKitBuild
    wget -q -O /tmp/bun-webkit-ohos-aarch64-release.tar.gz \
      https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/bun-webkit-ohos-aarch64-release.tar.gz
    tar xzf /tmp/bun-webkit-ohos-aarch64-release.tar.gz -C vendor/WebKit/WebKitBuild/
```

**修改**:

- 下载文件名: `bun-webkit-ohos-aarch64-release.tar.gz` → `webkit-ohos-aarch64-Release.tar.gz`
- 移除 `Release/` 移动逻辑 (见下一步)

**新代码**:

```yaml
- name: Download prebuilt WebKit
  run: |
    mkdir -p vendor/WebKit/WebKitBuild
    wget -q -O /tmp/webkit-ohos-aarch64-Release.tar.gz \
      https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/webkit-ohos-aarch64-Release.tar.gz
    tar xzf /tmp/webkit-ohos-aarch64-Release.tar.gz -C vendor/WebKit/WebKitBuild/
```

---

### 2. 移除 Release 移动逻辑 (原步骤 108-113)

**旧代码** (已作废):

```bash
# Fix: Move Release contents to correct location
# The tarball has Release/lib and Release/JavaScriptCore, but we need them in WebKitBuild/
if [ -d "vendor/WebKit/WebKitBuild/Release" ]; then
  cp -r vendor/WebKit/WebKitBuild/Release/* vendor/WebKit/WebKitBuild/
  rm -rf vendor/WebKit/WebKitBuild/Release
fi
```

**操作**: **删除此代码块**，新 artifact 解压后文件已在正确位置 (`lib/`, `Headers/` 直接在 `WebKitBuild/` 下)。

---

### 3. 移除 ICU 头文件提取 (原步骤 115-125)

**旧代码**:

```bash
# Extract ICU headers from the tarball (included as icu-headers/)
# and copy to vendor/icu-ohos for the build
if [ -d "vendor/WebKit/WebKitBuild/icu-headers" ]; then
  mkdir -p vendor/icu-ohos/include
  cp -r vendor/WebKit/WebKitBuild/icu-headers/unicode/* vendor/icu-ohos/include/unicode/ 2>/dev/null || \
  mv vendor/WebKit/WebKitBuild/icu-headers/unicode vendor/icu-ohos/include/
  echo "=== ICU headers extracted from WebKit tarball ==="
  ls -la vendor/icu-ohos/include/
else
  echo "WARNING: ICU headers not found in WebKit tarball"
fi
```

**操作**: **删除此代码块**。新 artifact 不包含 ICU 头文件，ICU 由 "Build ICU for OHOS" 步骤从源码编译提供。

---

### 4. 更新调试输出路径 (原步骤 128-139)

**旧代码**:

```bash
echo "=== WebKitBuild directory ==="
ls -la vendor/WebKit/WebKitBuild/
echo "=== WebKit lib directory ==="
ls -la vendor/WebKit/WebKitBuild/lib/ 2>/dev/null || echo "No lib directory in WebKitBuild root"
echo "=== JavaScriptCore ==="
ls -la vendor/WebKit/WebKitBuild/JavaScriptCore/ 2>/dev/null || echo "No JavaScriptCore"
echo "=== JavaScriptCore/PrivateHeaders ==="
ls -la vendor/WebKit/WebKitBuild/JavaScriptCore/PrivateHeaders/ 2>/dev/null || echo "No PrivateHeaders"
echo "=== JavaScriptCore/PrivateHeaders/JavaScriptCore ==="
ls -la vendor/WebKit/WebKitBuild/JavaScriptCore/PrivateHeaders/JavaScriptCore/ 2>/dev/null | head -10
echo "=== WTF ==="
ls -la vendor/WebKit/WebKitBuild/WTF/ 2>/dev/null || echo "No WTF"
```

**修改**: 路径从 `JavaScriptCore/PrivateHeaders/` 改为 `Headers/JavaScriptCore/`

**新代码**:

```bash
echo "=== WebKitBuild directory ==="
ls -la vendor/WebKit/WebKitBuild/
echo "=== WebKit lib directory ==="
ls -la vendor/WebKit/WebKitBuild/lib/ 2>/dev/null || echo "No lib directory in WebKitBuild root"
echo "=== JavaScriptCore headers ==="
ls -la vendor/WebKit/WebKitBuild/Headers/JavaScriptCore/ 2>/dev/null | head -10
echo "=== WTF headers ==="
ls -la vendor/WebKit/WebKitBuild/Headers/WTF/ 2>/dev/null | head -10
```

---

### 5. cmake 参数检查

**现有参数**:

```yaml
-DWEBKIT_PREBUILT=ON \
-DWEBKIT_PATH=vendor/WebKit/WebKitBuild
```

**是否需要修改?** ❌ **不需要**。  
新 artifact 将库和头文件直接放在 `WebKitBuild/` 下 (而非 `WebKitBuild/Release/`)，此路径仍正确。

但需确认 Bun 的 CMake 是否期望 `WEBKIT_PATH` 下的特定子目录结构。需要检查 `cmake/toolchains/ohos-aarch64.cmake` 或主 `CMakeLists.txt`：

```bash
# 应查找:
# - find_library(WEBKIT_JSC ... ${WEBKIT_PATH}/lib)
# - find_path(WEBKIT_JS_HEADERS ... ${WEBKIT_PATH}/Headers/JavaScriptCore)
```

如果 CMake 硬编码了 `JavaScriptCore/PrivateHeaders` 则需要更新。否则可能需要添加兼容性符号链接。

---

## 兼容性检查: Bun CMake 配置

### 需要验证的路径假设

在 `CMakeLists.txt` 或 `.clause` 中搜索:

```bash
grep -r "WEBKIT_PATH" cmake/
grep -r "JavaScriptCore/PrivateHeaders" .
grep -r "WTF/Headers" .
```

**如果找到硬编码的 `PrivateHeaders`**，需要更新为 `Headers/JavaScriptCore`。

**快速修复方案** (如果不修改 CMake):
在 "Download prebuilt WebKit" 步骤中添加符号链接，以保持向后兼容:

```bash
# After extracting new artifact, create compatibility symlinks
if [ -d "vendor/WebKit/WebKitBuild/Headers/JavaScriptCore" ]; then
  mkdir -p vendor/WebKit/WebKitBuild/JavaScriptCore
  ln -sfn ../Headers/JavaScriptCore/* vendor/WebKit/WebKitBuild/JavaScriptCore/ 2>/dev/null || \
    cp -r vendor/WebKit/WebKitBuild/Headers/JavaScriptCore/* vendor/WebKit/WebKitBuild/JavaScriptCore/
fi

# For WTF (if code expects WTF/Headers)
if [ -d "vendor/WebKit/WebKitBuild/Headers/WTF" ]; then
  mkdir -p vendor/WebKit/WebKitBuild/WTF
  ln -sfn ../Headers/WTF/* vendor/WebKit/WebKitBuild/WTF/ 2>/dev/null || \
    cp -r vendor/WebKit/WebKitBuild/Headers/WTF/* vendor/WebKit/WebKitBuild/WTF/
fi
```

但**更推荐**修改 CMake 直接使用新路径，因为这是结构改进。

---

## 完整修改清单

| 步骤    | 修改内容                             | 类型                     |
| ------- | ------------------------------------ | ------------------------ |
| 104-106 | 下载 URL 和文件名                    | 更新                     |
| 108-113 | 删除 Release 移动逻辑                | 删除                     |
| 115-125 | 删除 ICU 头文件提取                  | 删除                     |
| 128-139 | 更新调试 ls 路径                     | 更新                     |
| (可选)  | 添加兼容性 symlink                   | 新增 (如果 CMake 不修改) |
| (建议)  | 更新 CMake 中的 WEBKIT_PATH 查找逻辑 | 更新                     |

---

## 风险评估

| 风险                               | 概率 | 影响       | 缓解措施                                             |
| ---------------------------------- | ---- | ---------- | ---------------------------------------------------- |
| CMake 硬编码 `PrivateHeaders` 路径 | 高   | 构建失败   | 1. 添加 symlink 兼容层<br>2. 或修改 CMake 使用新路径 |
| 头文件缺失 (WTF/platform)          | 中   | 编译错误   | 新 artifact 已包含 `Headers/WTF/*` 平台目录，应齐全  |
| ICU 依赖                           | 高   | 链接错误   | 已有 "Build ICU for OHOS" 步骤，不依赖 artifact      |
| 文件名大小写                       | 低   | 路径不匹配 | 确认 `Headers/` vs `headers/` (新的是 `Headers/`)    |

---

## 验证计划

1. **本地预检查**:

   ```bash
   # 下载新 artifact 并解压
   mkdir -p /tmp/new-wk && tar xzf webkit-ohos-aarch64-Release.tar.gz -C /tmp/new-wk
   find /tmp/new-wk -type d | head -20
   ```

2. **CI 试运行**:
   - 提交修改后触发 CI
   - 观察 "Configure build" 和 "Build Bun" 步骤
   - 检查 CMake 是否找到正确头文件路径

3. **成功标准**:
   - CMake 配置无错误 (找到 libJavaScriptCore.a, JS 头文件)
   - 链接成功
   - `qemu-aarch64 build/ohos-release/bun --version` 输出正常

---

## 推荐修改顺序

**第一阶段 (最小改动，快速验证)**:

1. 更新下载 URL
2. 删除 ICU 提取和 Release 移动代码
3. 更新调试 ls 命令
4. **添加 symlink 兼容层** 应对可能的 CMake 硬编码

**第二阶段 (如果第一阶段成功)**:

- 清理 CMake 中的硬编码 `PrivateHeaders` 引用，永久转向新结构

---

## 修改后的 "Download prebuilt WebKit" 步骤示例 (含兼容层)

```yaml
- name: Download prebuilt WebKit
  run: |
    mkdir -p vendor/WebKit/WebKitBuild
    wget -q -O /tmp/webkit-ohos-aarch64-Release.tar.gz \
      https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/webkit-ohos-aarch64-Release.tar.gz
    tar xzf /tmp/webkit-ohos-aarch64-Release.tar.gz -C vendor/WebKit/WebKitBuild/

    # Compatibility: create PrivateHeaders symlinks if code expects old layout
    if [ -d "vendor/WebKit/WebKitBuild/Headers/JavaScriptCore" ] && [ ! -e "vendor/WebKit/WebKitBuild/JavaScriptCore/PrivateHeaders" ]; then
      mkdir -p vendor/WebKit/WebKitBuild/JavaScriptCore
      ln -sfn ../Headers/JavaScriptCore/* vendor/WebKit/WebKitBuild/JavaScriptCore/ 2>/dev/null || \
        cp -r vendor/WebKit/WebKitBuild/Headers/JavaScriptCore/* vendor/WebKit/WebKitBuild/JavaScriptCore/
      echo "Created compatibility links for JavaScriptCore headers"
    fi

    if [ -d "vendor/WebKit/WebKitBuild/Headers/WTF" ] && [ ! -e "vendor/WebKit/WebKitBuild/WTF/Headers" ]; then
      mkdir -p vendor/WebKit/WebKitBuild/WTF
      ln -sfn ../Headers/WTF/* vendor/WebKit/WebKitBuild/WTF/ 2>/dev/null || \
        cp -r vendor/WebKit/WebKitBuild/Headers/WTF/* vendor/WebKit/WebKitBuild/WTF/
      echo "Created compatibility links for WTF headers"
    fi

    echo "=== WebKitBuild directory ==="
    ls -la vendor/WebKit/WebKitBuild/
    echo "=== lib ==="
    ls -la vendor/WebKit/WebKitBuild/lib/
    echo "=== Headers/JavaScriptCore ==="
    ls -la vendor/WebKit/WebKitBuild/Headers/JavaScriptCore/ | head -10
    echo "=== Headers/WTF ==="
    ls -la vendor/WebKit/WebKitBuild/Headers/WTF/ | head -10
```

---

## 附录: 新 artifact 目录结构验证

```bash
$ tar -tzf webkit-ohos-aarch64-Release.tar.gz | head -30
./
./lib/
./lib/libJavaScriptCore.a
./lib/libWTF.a
./lib/libbmalloc.a
./Headers/
./Headers/JavaScriptCore/
./Headers/JavaScriptCore/APICallbackFunction.h
./Headers/JavaScriptCore/APICast.h
...
./Headers/WTF/
./Headers/WTF/Assertions.h
./Headers/WTF/Atomic.h
...
./Headers/WTF/unicode/
./Headers/WTF/unicode/icu/
...
```

**无** `Release/` 层级，**无** `icu-headers/`，**无** `DerivedSources/`。
