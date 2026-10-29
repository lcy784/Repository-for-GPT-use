# P09 单文件离线 A 候选

从 P08 `552f634` 接续，用户指令“执行P09开发”。复用共享运行核心，范围为江南样本、单座巨殿、行走／飞行／坠落、双视角、一个室内和可落屋顶。没有引入 P10 扩建。

## 构建和使用

```bash
bash scripts/setup-p09-cloud.sh
npm run build:a
npm run gate -- --through P09
```

输出 `dist/offline-a/天宫-A.html`，可单独复制；旁边 manifest.json 记录字节数、SHA-256、内嵌输入哈希和功能适用矩阵。构建时需要依赖；候选 HTML 运行时不需要 npm、服务、CDN 或附属资源文件。预期使用现代 Chromium/Edge，需 WebGL2 与 WebAssembly；Windows 正式性能验收留在 P15。

将 HTML 复制到普通目录，用浏览器打开。点击场景，WASD 行走，F 起飞／收起飞行，空格上升、Ctrl 下降、V 切视角，拖动转向。控制栏可结束和重新载入。文件模式的实际验收状态见正式报告，不能仅根据构建成功认定双击启动通过。

## 实现

专用 Vite IIFE 构建将动态模块合并，将样式、Rapier compat 的 WASM、完整当前资源注册表、模型、碰撞分区和配置内嵌。HTTP 开发版继续使用原适配器；A 通过已有 EmbeddedAssets 与相同的 SHA-256 校验、资源所有权、碰撞和人物逻辑运行。禁止遗漏 sidecar、动态 chunk 或 CSS 依赖。脚本闭合标签转义，并保留 JS 的美元替换字面值。

从 P09 起累计入口实际重建 A；产物和清单位于该次运行 `P09-package/`，绑定同一次 runId/candidate，不复用旧 PASS。

## 验收边界

P09-01 检查构建闭环与实际请求；P09-02 在全新上下文、清缓存、禁 Service Worker 和断网条件直接打开；P09-03 中文空格路径与复制路径；P09-04 在实际 A 字节上重跑连续核心旅程，增加大厅后墙阻挡和实际坠落，保留默认 10m/s 和同一人物，禁止状态注入。

当前受管云端 Chromium 的 URLBlocklist/Allowlist 不允许 file://，实际报 ERR_BLOCKED_BY_ADMINISTRATOR。测试记录 BLOCKED，不修改策略、不放宽安全设置。为完成可执行部分，另用允许的回环 HTTP 服务同一复制字节，阻止全部非回环请求，检查冷启动、像素、操控、释放与完整路线；这不等同 file 模式断网通过。允许直接打开的环境可运行同一 P09 检查，file 成功时不启用 HTTP 诊断入口。

P06 独立美术认可仍缺，用户此次指令授权继续包装已有样本；原 P08 等待／重试继续为工程默认，P15 设备数据和完整 B 包仍待后续。
