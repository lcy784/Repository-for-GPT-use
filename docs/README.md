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
