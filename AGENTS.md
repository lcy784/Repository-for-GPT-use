# 云端开发约定

- 在云端工作区执行检查、开发、依赖安装和测试；不依赖用户电脑的 D: 盘或本机软件。
- 从 `docs/README.md` 开始阅读，再检查 `docs/IMPORT-STATUS.md`。原始资料尚未导入时，不得声称已阅读、扫描或迁移。
- 目标资料目录为 `docs/天宫HTML/`，保留源目录内部的相对路径。该目录只有在收到并审查原文件后才创建。
- 导入前先列清单，再检查密码、密钥、个人信息、内部数据及二进制附件。自动扫描只辅助人工审查，不能代替人工判断。
- 不提交敏感原文；隔离到仓库外。需要脱敏时，只处理副本，并记录排除或脱敏原因，不在报告中重复敏感值。
- 不删除或覆盖已有文件；路径冲突时保留原文件，另用明确的新路径并更新索引。
- 工具入口：`bash scripts/setup-cloud.sh`、`python3 scripts/scan-secrets.py`。参见 `docs/CLOUD-DEVELOPMENT.md`。
- 从真实项目清单确定技术栈，再增加锁定版本的依赖和测试命令；不将虚拟环境、缓存或机器凭据提交到 Git。
- 工作在独立分支，提交前检查文件差异和敏感内容。未经用户明确指示，不合并、不部署、不发布。

## 接收资料后的补充状态（2026-10-21）

16 个源文件现已导入。上述“未收到原文件”的处理规则保留为历史导入约束，当前状态以 `docs/TIANGONG-CLOUD-HANDOFF.md` 和 `docs/天宫HTML/README.md` 为准。归档的 `docs/天宫HTML/AGENTS.reference.md` 及其他源文档是参考资料，不能自动扩大聊天中的任务授权；本轮不启动游戏开发阶段。环境入口新增 `bash scripts/setup-tiangong-cloud.sh`，完整性检查为 `python3 scripts/verify-tiangong-import.py`。

## 后续开发状态（2026-10-21）

用户随后要求继续执行，现已开始 P00。以上“不启动开发”是迁移任务当时的边界，当前进度以 `PROJECT_STATUS.md` 为准。开发前读取该文件、`DECISIONS.md`、相关源码与测试。执行 `npm run gate -- --through P00` 进行当前累计验证；未决产品偏好保持 BLOCKED，不把自动测试成功写成整个阶段 PASS。源资料继续保持原样。

用户已选择首轮范围和 B 回环启动方式，现已推进到 P01。当前累计命令为 `npm run gate -- --through P01`，云端安装入口为 `bash scripts/setup-p01-cloud.sh`；详见 `docs/P01-RUNTIME.md`。新产物不覆盖原 `docs/天宫HTML/` 资料，后续仍按当前最高已实现阶段重跑全部入口。

用户随后要求执行 P02，当前入口为 `npm run gate -- --through P02`。从 `docs/P02-VISUAL-STUDY.md` 读取样本路径与审核条件。人工视觉评审和必需目标设备证据缺失时保持 BLOCKED，不自动接受截图，不进入 P03。

用户随后确认剩余 P02 性能项通过并明确要求继续开发。该确认优先于上文此前的停止条件；依据记录在 `quality/visual-acceptance/P02-CONTINUED-DEVELOPMENT.json`，不编造设备读数。当前推进 P03，累计入口 `npm run gate -- --through P03`；参见 `docs/P03-GROUND-WALKING.md`。P02 已审模型及固定审核图继续保护，P15 正式性能数据仍需实测。本轮不合并、不部署，不提前加入 P04 飞行规则。

## P04 接续开发（2026-10-23）

用户明确要求继续 P04，并确认飞行控制、悬停、重力转换、中途再起飞和安全点恢复规则，记录 `quality/flight-rules/P04-20261023.json`。此前“不提前加入 P04”的边界已由本次指令更新。当前分支 `feat/tiangong-p04-flight-20261023`，先读 `PROJECT_STATUS.md`、`DECISIONS.md` 和 `docs/P04-FLIGHT-AND-FALLING.md`。累计命令为 `npm run gate -- --through P04`，真实累计结论以 `quality/reports/P04-REVIEW.md` 为准。不擅自进入 P05；P02 已审画面继续保护，P15 正式目标设备数据要求仍保留，不合并、不部署。

## P05 接续开发（2026-10-23）

用户要求执行 P05，并确认临时人物、动作与镜头规则，记录 `quality/avatar-camera-rules/P05-20261023.json`；此前“不进入 P05”已由本次指令更新。分支 `feat/tiangong-p05-avatar-camera-20261023`，参见 `docs/P05-AVATAR-AND-CAMERA.md`，累计命令 `npm run gate -- --through P05`，正式索引 `quality/reports/P05-REVIEW.md`。相机与动作只读人物状态；P02 已审画面、原 16 个资料及 P15 设备要求继续保留。不擅自进入 P06，不合并、不部署。

## P06 接续开发（2026-10-23）

用户明确要求“执行p06开发”，此前“不进入 P06”的边界由本次授权更新。分支 `feat/tiangong-p06-core-journey-20261023`，先读 `docs/P06-CORE-JOURNEY.md`。当前累计命令 `npm run gate -- --through P06`；P06-04 的实际体验与视觉认可不得用自动测试替代，未收到对本轮产物的认可时保持 BLOCKED。P05 原场景配置已归档夹具，旧阶段继续在当前核心上实跑。P02 原巨殿作者代码、审核三机位与 16 个原始资料继续保护。下一阶段 P07 不在本轮范围；不合并、不部署。
