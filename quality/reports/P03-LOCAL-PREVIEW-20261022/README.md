# P03 Windows 一键本地预览

北京时间 2026-10-22。游戏构建沿用提交 `f394d0a`，74 个正式文件摘要全部一致；本次仅增加预览交付附件，未修改游戏源码、模型或配置。

下载同目录 `Tiangong-P03-Windows.zip`，完整解压到新目录，双击 `Start-Tiangong.cmd`。保持窗口打开，然后在 Edge 访问 **http://127.0.0.1:4173/**。无需安装 Node 或 Python。服务只监听本机；端口占用时停止，不接管其他程序。

云端 PowerShell 7.4.19 上实际通过 74 文件并发 HTTP/hash 检查、9 项协议/边界用例、端口冲突与构建篡改拒绝。云端 Chromium 通过实际 PowerShell 服务渲染 P03，真实 W 键移动约 0.80 米，无外部请求或页面错误。详细记录见 `CHECKS.json`、`http-checks.json`、`launcher-checks.json`、`browser-checks.json`。

启动器按 Windows PowerShell 5.1 / .NET Framework API 编写；未在用户 Windows 或 Edge 上运行。当前浏览器插件未提供控制接口，所以不能声称已经为用户启动本机服务。用户需完成下载、解压、双击这一步。这是 P03 临时预览，不是最终 A/B 包或新硬件性能结论。

新启动脚本与说明的 detect-secrets 扫描为 0 项；游戏资源与已审正式构建逐文件匹配。包内附第三方运行库许可证，不含源资料、Git、node_modules 或账户凭据。校验见 `SHA256SUMS.txt`。没有合并、部署或发布站点。
