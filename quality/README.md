# P00—P01 累计回归门禁

在云端执行。先按 `docs/TIANGONG-CLOUD-HANDOFF.md` 安装锁定的工具；之后从仓库根目录运行：

```bash
npm run gate -- --through P01
```

退出码：0 为 PASS，1 为失败，2 为 BLOCKED 或调用参数不正确。用户已选择首轮范围和 B 启动方式，P00 对应阻塞已解除。也可单独运行 `npm run test:gate` 诊断门禁测试；单测成功不代表整个阶段放行。

## 实际实现

- `stage-manifest.json` 登记 18 个主阶段、4 个可选扩展、5 个联机阶段及原计划中的用例编号。P00、P01 有真实入口；未来阶段没有空成功脚本。
- `implementation-decisions.json` 区分工程选型、待选择的产品范围和未来决策。不得仅为通过门禁把未定值改为“用户已选”。
- `acceptance-profile.json` 固定云端显示条件、模拟起始参数和视觉样本的工程机位；正式 Windows 性能和实际样本视觉评审另行记录。
- `contracts.json` 和 `src/shared/contracts.ts` 定义单位、坐标、接口和唯一状态写入方，不含游戏实现。
- P00 会检查源文档完整性、TypeScript 契约和配置，然后实际启动 Vitest 故障注入测试。
- P01 会重新构建当前应用，再运行时钟单测及开发页／生产包的真实浏览器检查，具体见 `docs/P01-RUNTIME.md`。

门禁必须从 P00 累计执行到目标阶段。前序阶段失败或 BLOCKED 后，后续入口不会运行。任何主阶段缺失、禁用或乱序都不能缩短累计链。未启用的扩展不算 PASS。

每个阶段结果都绑定本次 run-id、候选指纹、确切必测用例与非零实跑数量；缺失报告、非零退出、超时、skip/todo、伪造 PASS、缺失／越界证据和哈希不匹配会拒绝放行。测试在临时目录模拟未来阶段，验证的是编排器，没有冒充 P01/P02 游戏实现。

## 证据和候选版本

每次运行写入唯一的 `quality/reports/<run-id>/`：候选文件清单、契约快照、阶段 JSON、Vitest 报告、日志和累计结论。失败记录保留，不使用“最后一次成功”覆盖旧结果。

候选指纹涵盖源码、原始资源、文档、契约、验收配置、用例清单和依赖锁文件。只排除 Git 元数据、安装目录、Python 缓存、`quality/reports/` 和 `dist/` 输出，避免报告包含自身而形成循环。P01 为本轮重建的生产文件单独生成 SHA-256 清单并绑定到报告。阶段执行前后重新计算源码指纹，期间输入改变即失败。

报告默认忽略提交；本轮最终的真实 P00 记录会作为审查证据显式加入 Git。报告中的逐个证据文件也有 SHA-256。历史报告仅用于审查，任何下次运行都会重新启动阶段进程，不从旧 PASS 缓存取得资格。

P00 的“构建”产物是带候选指纹的契约快照；P01 产物是实际的三维底座生产构建。两者都不冒充最终 A/B 游戏交付包。

## P02 增补

当前累计命令为 `npm run gate -- --through P02`。P02 有真实入口和三机位生产浏览器检查；详见 `docs/P02-VISUAL-STUDY.md`。P01 用提交的固定配置继续覆盖底座，默认应用改为巨殿；仍真实构建、绘制和执行生命周期测试。

P02 的截图稳定性和三维射线检查成功，只能证明技术事实。人工视觉评审和真实 Windows 设备代价证据未到时，P02-02／P02-04 记 BLOCKED，整体退出码 2，不获得 P03 资格。报告保留当前候选截图及来源／尺度、成本记录；禁止把本次截图自动登记为已批准基线。

## P03 增补

用户明确确认 P02 剩余性能项通过并继续开发，记录为 `visual-acceptance/P02-CONTINUED-DEVELOPMENT.json`，不虚构硬件测量。P02 现在可按用户确认及本轮技术／视觉复测通过；固定审核配置和已审美术／图像仍锁定，允许新增非美术玩法代码。

当前累计命令 `npm run gate -- --through P03`，包含真实 WASM 物理回放、三机位 P02 审核、P03 实际输入与生命周期。P03 说明为 `docs/P03-GROUND-WALKING.md`；物理状态原始证据保存为 `P03-physics-observations.json`。未进入 P04，不合并、不部署。

## P04 增补

P04 用户规则记录 `flight-rules/P04-20261023.json`，独立入口 `scripts/quality/stages/P04.mjs`；累计命令 `npm run gate -- --through P04`。包含真实 WASM 飞行／重力转换、高速扫掠、实际巨殿屋面、原生标签页隐藏恢复、真实键盘与默认场景验证。P03 巨殿旧输入保存在 `fixtures/P03/palace-runtime-config.json`，继续在当前生产核心运行。未来 P05 入口仍未实现。正式索引 `reports/P04-REVIEW.md`，调试报告不当成阶段放行。

## P05 增补

P05 选择记录 `avatar-camera-rules/P05-20261023.json`；真实入口 `scripts/quality/stages/P05.mjs`。累计命令 `npm run gate -- --through P05`，包含 GLB 校验与可复现生成、真实动画与关节、Rapier 相机球形扫掠、实际 V／按钮／拖动、12 次切换、分辨率与原生焦点恢复、模型缺失与资源释放。原 P04 巨殿输入归档到 `fixtures/P04/palace-runtime-config.json`，继续在当前核心运行。正式索引 `reports/P05-REVIEW.md`，P06 未启动。

## P07 增补

当前累计命令 `npm run gate -- --through P07`。真实入口 `scripts/quality/stages/P07.mjs` 检查资源契约、原作者源哈希、实际 GPU 共享／迟到资源、两处迁移 PNG 和十次纹理／完整 P06 世界装卸。结果逐项绑定本轮候选及构建证据，未实现阶段仍无占位成功入口。P06 的明确继续授权另记 `visual-acceptance/P06-CONTINUED-DEVELOPMENT.json`，标明独立美术认可未提供，不伪造艺术评分。详见 `docs/P07-ASSET-LIFECYCLE.md` 和 `reports/P07-REVIEW.md`。
