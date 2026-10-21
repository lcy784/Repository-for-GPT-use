# P02 视觉验收与剩余性能项

用户在巨殿修订版及三机位截图展示后回复“验收通过”。现记录为人工视觉验收通过，已审实现提交 `1110e3868bd692b839204c1d2252ba1424f62984`。最新分支为 `docs/tiangong-p02-visual-acceptance-20261021`。

- 机器记录：`quality/visual-acceptance/P02-20261021.json`。
- 已审三机位图：`quality/reports/2026-10-21T15-29-39-829Z-0da8381d/P02-browser/{far,stairs,human}.png`。
- 先前改动和尺度说明：`docs/P02-MONUMENTAL-REVISION.md`。
- 验收检查：`scripts/quality/visual-acceptance.mjs`；边界测试：`tools/tiangong/tests/visual-acceptance.test.mjs`。

本轮不改变游戏画面。验收记录从已审候选提取运行源码、本地资源、依赖锁和构建配置的哈希，并绑定三张实际 PNG。当前候选重建的画面和这些输入一致时，P02-02 可通过；缺失用户验收、修改／新增视觉输入或改变像素均不能自动更新基线。历史候选被篡改会失败。文档与验收工具本身更新不会被误认为用户重新修改了画面。

仍在云端执行 `npm run gate -- --through P02`，实跑全部历史入口和当前生产浏览器检查。P02-04 所需真实目标设备读数尚未提供；云端软件渲染仍不能证明 Windows 60 FPS。因此本轮仅解除视觉审核项，整体保持 BLOCKED，不进入 P03。

旧报告和待评审索引是验收前的历史证据，保持原样。新累计报告写入新的唯一 run-id，并附本次 `P02-visual-acceptance.json`；本轮索引为 `quality/reports/P02-ACCEPTANCE-REVIEW.md`。不合并、不部署。
