# 天宫HTML · 云端开发交接

## 当前实际状态

- 本轮工作：资料迁移、敏感内容检查、路径映射和云端工具准备。
- 源文件：已接收并导入 16 个文件，内容均与 ZIP 原条目一致。读取入口是 `docs/天宫HTML/README.md`。
- 开发阶段：P00—P17 以及可选阶段均未开始。本轮工具探测不是任何阶段的 PASS。
- 当前仓库分支：`docs/tiangong-cloud-20261021`；未合并、未部署。新的云端会话必须选择此分支。
- 资料可独立从 GitHub 克隆，后续工作不依赖本机 D: 盘、聊天附件地址或本次云端的临时解压目录。

## 云端环境与可重复安装

已准备的工具包位于 `tools/tiangong/`；`package.json` 固定直接依赖，`package-lock.json` 固定依赖树与下载完整性值。Node.js 版本记录在 `.node-version`。

| 工具 | 本次版本／用途 |
| --- | --- |
| Node.js / npm | 24.19.0 / 11.9.0；开发工具运行时 |
| Python | 3.12.14；扫描和文件完整性检查 |
| detect-secrets | 1.5.0；凭据扫描，禁用联网验证 |
| Babylon.js core / loaders | 9.31.2；三维工具准备 |
| Rapier 3D compat | 0.21.0；自带 WASM 的物理库 |
| TypeScript | 7.0.2；类型工具 |
| Vite | 8.3.5；构建工具 |
| Vitest | 5.0.5；逻辑测试工具 |
| Playwright | 1.64.1；浏览器自动检查 |
| gltf-validator | 2.0.0-dev.3.10；GLB/glTF 验证工具 |
| Chromium | 154.0.8037.57；当前云端系统浏览器 |
| Blender | 4.3.2；当前云端预装资产制作工具 |

从仓库根目录执行：

```bash
bash scripts/setup-tiangong-cloud.sh
python3 scripts/verify-tiangong-import.py
python3 scripts/scan-secrets.py
```

整仓凭据扫描会将导入清单中的 17 个 SHA-256 校验值提示为高熵字符串，退出码为 1；这些命中已逐项核对为公开的文件／ZIP 摘要，并未作为凭据上传。没有关闭高熵检测或全局忽略清单。只扫描原资料可运行 `python3 scripts/scan-secrets.py docs/天宫HTML`，其结果为 0 个疑似命中。

安装脚本调用原扫描工具安装脚本，然后使用 `npm ci --ignore-scripts` 安装锁定工具，最后执行三维库、WASM、命令行和离线浏览器探测。重复检查可运行：

```bash
npm --prefix tools/tiangong run check
```

当前云端 Chromium 的管理策略禁止 `file://`。检查脚本不修改该策略：仅在 `127.0.0.1` 临时提供单个参考 HTML，阻止公网请求，加载后再切换离线进行交互，最后关闭浏览器和服务。这验证了参考内容可渲染及加载后离线操作，未验证直接双击或 file 协议的冷启动。

工具安装在云端的 `.cloud-tools/` 和 `tools/tiangong/node_modules/`，均不提交；依赖清单、锁文件、脚本和参考资源提交到 GitHub。npm 缓存也保存在 `.cloud-tools/`，避免依赖不可写的用户主目录。无需在用户电脑安装这些工具。

新环境需提供 Bash、Git、Node.js 24.19+（24.x）、Python 3.12 及 venv/pip。浏览器检查优先使用 `CHROMIUM_PATH` 或系统 Chromium；没有系统浏览器时，可执行 `npm --prefix tools/tiangong run browser:install` 下载 Playwright 管理的 Chromium，需在云端环境配置中允许其下载域名并安装浏览器系统依赖。当前环境已有可用 Chromium，不需要该下载。系统浏览器和 Blender 的预装不由 npm 锁文件复现；更换云端镜像时应重新核对，并按实际资产任务安装 Blender。

本次只安装文档所列离线技术栈的工具。没有下载无许可的模型、音乐或额外纹理；参考 HTML 自带其运行代码。未来选用的模型、纹理、字体、解码器及其他资源，应在实际开发时逐项获取、记录来源与许可并验证本地加载。

## 接续开发时的边界

当前请求不包含实现全部游戏阶段。附件里的自动开发指令已保留为参考资料；它们不替代聊天中的任务授权。

若后续开始实现，先从 P00 的范围与验收问题出发，区分产品要求、架构建议和仍待确认的事项，再逐阶段构建与累计回归。文档中规划的 `npm run gate -- --through Pxx` 目前没有实现，不得报告为已运行。云端软件渲染检查也不能证明目标 Windows 硬件能达到 60 FPS。
