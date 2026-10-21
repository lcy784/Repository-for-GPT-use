# P01 · 三维底座的云端运行与验证

本阶段包含真正的 Babylon.js WebGL2 场景、前后层次明确的测试网格、光照、两个相机位置、配置加载、可见错误提示、固定模拟时钟和资源释放。当前是底座预览，没有把几何测试体当作已完成的巨殿、人物或飞行。

用户已选择首轮范围：单座巨殿、行走与飞行、双视角、一个室内、可落屋顶；B 使用本机静态服务。选择记录在 `quality/implementation-decisions.json`，后续功能仍按阶段串行实现。

## 新云端环境

选择 `feat/tiangong-p01-20261021` 分支，在仓库根目录运行：

```bash
bash scripts/setup-p01-cloud.sh
npm run gate -- --through P01
```

环境需要 Node.js 24.19+（24.x）、Python 3.12、Bash、Git、Debian 13 amd64 兼容的 Chromium/X11 运行库和 `dpkg-deb`。安装脚本准备锁定的 Python 扫描工具、Node 工具及应用依赖，再安装工作区内的 Xvfb 并构建。系统已有 Xvfb 时使用系统版本；否则从 Debian 下载校验锁定的 Xvfb 和 xserver-common，不需要 root 或修改系统文件。

`tools/system-packages.json` 保存来自 Debian 签名索引的包版本、相对下载路径和 SHA-256。依赖包只放进 `.cloud-tools/`。当前环境的 Chromium 为 154.0.8037.57；若更换基础镜像，应先重新验证系统运行库。缺少环境时不能将测试算作通过。

新的 Python 工具环境默认在 `.cloud-tools/python/`，扫描命令为：

```bash
CLOUD_TOOLS_DIR=.cloud-tools/python python3 scripts/scan-secrets.py
```

原始导入清单、Debian 包和测试报告包含公开校验摘要，凭据扫描可能提示高熵字符串；需核对命中内容，不全局禁用检测。

## 预览与构建

```bash
npm run dev
npm run build
npm run preview
```

服务仅监听 `127.0.0.1`。`dev` 查看开发页，`preview` 查看当前 `dist/` 生产构建；两者都只是本机测试服务，不是部署。构建依赖来自版本锁文件，当前运行配置、脚本、样式和着色器从本地读取。`dist/` 是生成物，不提交到源码目录。

页面提供两个观察位置、旋转／缩放、结束预览和重新载入。运行信息可展开查看帧号、逻辑步号、后端、真实渲染器和错误。`window.__TIANGONG_OBSERVE__()` 是不可写的只读观察接口，不提供修改人物、物理或阶段状态的入口。

## 实际检查与证据

- P00：重新运行来源完整性、独立类型契约和 30 个门禁单测。
- P01-01：开发页与生产包都加载真实网格，帧数推进；导出两个机位的真实画布并核对像素输出不同，资源成功加载且无公网请求或意外控制台错误。
- P01-02：实际注入 WebGL2 缺失、WASM 缺失、配置文件 404 和渲染异常，检查可见错误、零存活引擎、监听释放，不误报 ready。
- P01-03：6 个固定时钟测试覆盖 30/60/144 Hz、长卡顿、恢复与非法参数；另外在 Xvfb 中启动原生 Chromium 标签页，真实经历 visible→hidden→visible，核对隐藏时不渲染、返回后补算受限。
- P01-04：三种窗口尺寸及三轮结束／重启，核对尺寸、引擎、画布、监听与实际渲染计数，没有遗留渲染循环。

Playwright 默认会强制页面保持前台。可见性检查使用单独的空白浏览器配置和公开的 `connectOverCDP(..., { noDefaults: true })`，避免该覆盖；没有改写 `document.visibilityState` 或手动派发可见性事件。普通场景检查和真实标签页检查均使用当前生产构建。

累计门禁先实际执行 P00，再执行 P01。报告保留源码候选、生产文件摘要、浏览器结果、图片与日志，位于 `quality/reports/<run-id>/`；失败记录保留。生成的 `dist/` 不纳入源码候选，而通过本轮生产清单单独绑定。

已修复 P01 新增 tsconfig 后，TypeScript 7 拒绝 P00 原“直接指定文件”命令的问题：P00 改用独立 `quality/tsconfig.contracts.json`，保持两个阶段的检查边界。首次失败和修复后的累计结果均保留。

这里的通过结论只覆盖 P00/P01 功能检查。云端 SwiftShader 结果不等于目标 Windows 的 60 FPS、最终画质或巨殿视觉验收。A 单文件包、B 便携分发包和 `file://` 冷启动尚未交付或验证。

本次 `bash scripts/setup-p01-cloud.sh` 已在当前云端实际执行成功，包括新的 Python 工具环境、两套 Node 锁文件安装、带校验的系统工具准备和生产构建。构建目前有约 1.06 MB 主 JS chunk 的体积提示，尚未将此底座视作最终性能优化或分发体积验收。
