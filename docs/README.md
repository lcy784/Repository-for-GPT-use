# 项目文档入口

云端 Codex 应从本文件开始阅读。所有路径相对于仓库根目录，克隆后可直接访问，不依赖 Windows 盘符。

| 路径 | 内容 | 状态 |
| --- | --- | --- |
| `docs/IMPORT-STATUS.md` | 已找到的资料、敏感检查范围及待完成事项 | 可读取 |
| `docs/CLOUD-DEVELOPMENT.md` | 云端工具安装、扫描和开发流程 | 可读取 |
| `AGENTS.md` | 云端开发和文件保留约定 | 可读取 |
| `docs/天宫HTML/` | 原文件夹内容，保留内部相对路径 | 待接收原文件，目前不存在 |
| `。。` | 仓库原有说明 | 保留原样 |

## 下一步

收到源文件后，先生成完整清单并进行敏感检查，再将可提交内容复制到 `docs/天宫HTML/`，补充逐文件索引、排除说明及校验信息。不得将“目标路径已约定”视为“文件已导入”。

## 更新：原文件已接收并导入（2026-10-21）

上表的“待接收”是初次准备时的历史状态，现已完成 16 个源文件的导入。当前阅读入口：

- [天宫HTML 完整文件索引和旧路径映射](天宫HTML/README.md)
- [云端交接、版本和安装命令](TIANGONG-CLOUD-HANDOFF.md)
- [导入与敏感内容检查报告](TIANGONG-IMPORT-REPORT.md)
- [逐文件 SHA-256 清单](tiangong-import-manifest.json)

需要选择 `docs/tiangong-cloud-20261021` 分支；未合并前主分支没有这些资料。

## 后续开发入口

P00 实现在 `feat/tiangong-p00-20261021` 分支，包含上述完整归档。最新状态见仓库根目录 [PROJECT_STATUS.md](../PROJECT_STATUS.md)，决策见 [DECISIONS.md](../DECISIONS.md)，累计门禁见 [quality/README.md](../quality/README.md)。此前的导入报告和交接说明保留为迁移完成时的记录。

当前开发已进入 `feat/tiangong-p01-20261021` 分支，范围已选定，P00—P01 已累计通过。新增 [P01 云端运行说明](P01-RUNTIME.md)。当前分支包含此前资料与门禁，新的云端会话应选择此分支读取最新进展。

P02 的当前开发分支为 `feat/tiangong-p02-20261021`，包含全部历史资料。新增 [巨殿视觉样本与审核路径](P02-VISUAL-STUDY.md)，当前进度始终以根目录 `PROJECT_STATUS.md` 为准。

用户反馈后的最新调整分支为 `feat/tiangong-p02-monumental-20261021`，见 [巨殿尺度与繁复构件修订](P02-MONUMENTAL-REVISION.md)。此前 P02 分支保留供对照。

用户已明确验收巨殿视觉样本。最新验收记录分支为 `docs/tiangong-p02-visual-acceptance-20261021`，见 [P02 视觉验收与剩余性能项](P02-VISUAL-ACCEPTANCE.md)。

用户确认 P02 性能项并要求继续，当前开发分支 `feat/tiangong-p03-ground-walking-20261021`；详见 [P03 地面行走与碰撞](P03-GROUND-WALKING.md)，累计命令 `npm run gate -- --through P03`。P02 性能为用户确认，设备原始读数未提供；当前最新进度以根目录状态文件为准。

用户已要求执行 P04，并确认飞行／坠落规则，当前分支 `feat/tiangong-p04-flight-20261023`；见 [P04 飞行、降落与坠落](P04-FLIGHT-AND-FALLING.md)。累计命令 `npm run gate -- --through P04`，当前状态以根目录 `PROJECT_STATUS.md` 和 P04 正式交付索引为准。

用户已要求 P05 并确认人物／镜头规则，当前分支 `feat/tiangong-p05-avatar-camera-20261023`，见 [临时古装人物与双视角](P05-AVATAR-AND-CAMERA.md)。累计命令 `npm run gate -- --through P05`，最终结论见 `quality/reports/P05-REVIEW.md`。

用户已要求执行 P06。当前分支 `feat/tiangong-p06-core-journey-20261023`，见 [完整核心旅程](P06-CORE-JOURNEY.md)，累计命令 `npm run gate -- --through P06`。自动项和待用户审核项以正式报告分别记录，不把自动检查通过写成 P06 整体已验收。
