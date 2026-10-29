# P09 单文件 A：开发完成，直接打开验收 BLOCKED

2026-10-29（America/Tijuana），分支 `feat/tiangong-p09-offline-a-20261029`，实现提交 `e988d4e`。

**正式累计 P00—P08 全 PASS；P09 整体 BLOCKED，退出码 2，不允许进入 P10。** 仅因受管云端 Chromium 的 URL 策略拒绝 file://，不能将回环 HTTP 成功认作直接打开离线成功。

- [正式累计结果](2026-10-29T14-15-51-767Z-55e91d69/summary.json)
- [单文件 HTML A 候选](2026-10-29T14-15-51-767Z-55e91d69/P09-package/天宫-A.html)（14,815,398 字节，内嵌 66 项配置与资源）
- [产物哈希与适用矩阵](2026-10-29T14-15-51-767Z-55e91d69/P09-package.json)
- [完整性复核](2026-10-29T14-15-51-767Z-55e91d69/P09-delivery-integrity.json)

SHA-256：`9d862ce52e0f5711ca0b7e988b76c0fb7dd488a257b6c240f31f094a2ac48d87`。

| 检查 | 结果 | 实际证据 |
| --- | --- | --- |
| P00—P08 | PASS | 在本轮当前候选实际重跑全部入口，P02 原审核图不变 |
| P09-01 依赖闭环 | PASS | 单个 IIFE、内嵌 WASM/配置/模型/真实碰撞分区；静态保护 4 项测试和动态请求审计 |
| P09-02 空缓存断网直接打开 | BLOCKED | 全新上下文、禁 Service Worker、offline=true；file 导航 ERR_BLOCKED_BY_ADMINISTRATOR |
| P09-03 路径与复制 | BLOCKED | 中文空格与普通复制目录均遇同一 file 策略拒绝；同字节回环 HTTP 诊断通过 |
| P09-04 A 核心回归 | PASS（回环 HTTP 作用域） | 实际 A 文件：14 个连续检查点、13 张 PNG、后墙阻挡、实际坠落、双视角穿云、室内、屋顶及再次起飞，无 JS 错误或外部请求 |

[复制/画面/操控/释放记录](2026-10-29T14-15-51-767Z-55e91d69/P09-copies/copies.json)、[实际 A 路线](2026-10-29T14-15-51-767Z-55e91d69/P09-journey/results.json)。HTTP 诊断允许读取该 HTML 的回环地址，其余 HTTP 请求全部阻断；没有声称 context offline=true 下 HTTP 可用。file 直接打开尚无可用验收证据，不修改或绕过浏览器受管策略。

## 检查与修复记录

[完整测试集](P09-preflight/final-all-tests.json)：13 个测试文件、147 项全部通过。原 16 个资料 10,531,422 字节与 SHA-256 不变。最终敏感扫描六项均逐行核实为既有来源或内容 SHA-256，见 [扫描复核](P09-preflight/scan-review.json)。

首轮 file 阻塞见 [原始失败](P09-preflight/first-stage-failure.json)。初步长路线在殿前主动停止以避免与正式累计争用软件 GPU，记录 [中止原因](P09-local/interruption.json)，未计作 PASS。

第一轮正式累计 [2026-10-29T13-50-14-322Z-edfc3d92](2026-10-29T13-50-14-322Z-edfc3d92/summary.json) 已通过 P00—P08，P09 被过严的动态依赖断言拦住。Rolldown 在单 IIFE 的 dynamicImports 元数据中登记当前文件自身；这不是缺失外部文件。修正为仅允许同名自引用，其他静态/动态外部边仍拒绝，新增回归用例，采用原生 codeSplitting:false。修正前后 HTML 字节及哈希完全相同。

本应先独立确认新构建检查再运行耗时累计，顺序安排造成了重复。修正后按仓库当前候选全历史实跑要求重新从 P00 至 P09；最终结果即上表，没有使用第一轮 PASS 替代。

## 使用与边界

构建 `npm run build:a`，输出 `dist/offline-a/天宫-A.html`。HTML 可单独复制，WASD 行走、F 飞行、空格/Ctrl 升降、V 双视角、拖动转向。此处提供可审查候选；完成 P09 还需在允许 file:// 的受控浏览器环境实际执行同一份复制、断网和全路线检查。

P06 独立艺术认可、P08 未就绪区域等待/重试的最终偏好与 P15 Windows 正式测量仍未确认。本轮没有合并、部署、发布或进入 P10。根状态文件保留本轮候选输入，最终实际验收结论以此报告及绑定 summary 为准。
