# 枪械、直立步态与三分钟关卡验收

日期：2026-10-02（Asia/Shanghai）  
执行：Codex 本地自动回归与截图检查  
集成分支：`work/codex/firearms-integration`

## 目标与范围

依用户本轮连续要求实现：幸存者使用枪械、身体保持竖直且仅手臂瞄准、腿走/跑；僵尸直立蹒跚；前期慢且少，后期数量与速度递增；整体内容在三分钟内完成并结算。

GitHub 未配置远程，无法建立 Issue/PR。以下为实际本地互斥范围，不代表已创建远程任务：

| 任务 | 分支与独占写入范围 |
| --- | --- |
| 网页 | `work/web/firearms-motion`，`prototype-2d/**` |
| 小程序 | `work/wechat/firearms-motion`，`wechat-miniprogram/**` |
| 集成 | `work/codex/firearms-integration`，验证脚本、STATUS、根 README 与本记录；串行接收两端提交 |

## 改动文件

- 网页：`prototype-2d/index.html`、`prototype-2d/README.md`、`prototype-2d/tests/combat-smoke.mjs`。
- 小程序：`wechat-miniprogram/project.config.json`、`miniprogram/app.json`、`miniprogram/app.wxss`，以及 `miniprogram/pages/index/index.js`、`index.json`、`index.wxml`、`index.wxss`。
- 集成：`scripts/validate.mjs`、`scripts/verify-combat.mjs`、`STATUS.md`、`README.md` 与本记录。

两端开始时都缺失运行代码：网页止于战斗脚本占位，小程序脚本未闭合且缺页面与应用配置。为完成行为改造，本轮补齐这些运行前置部分。

## 三分钟节奏

| 时间 | 内容 |
| --- | --- |
| 0 秒 | 8 名慢速普通感染者；0.8/秒基础生成；步枪自动锁敌 |
| 15 秒 | 第一批额外尸潮；此后常规每 10 秒一批 |
| 30 / 45 / 60 秒 | 分别开放疾跑 / 重型 / 爆囊类型 |
| 全程 | 刷怪速率与普通感染者速度逐步提高，刷怪最高 8/秒；经验需求压缩 |
| 150 秒 | 最后 30 秒撤离提示；额外尸潮间隔缩为 6 秒 |
| 180 秒 | 撤离成功、停止战斗、展示结果，允许重新构筑 |

## 实际命令与结果

```powershell
node scripts/validate.mjs
node prototype-2d/tests/combat-smoke.mjs
# PLAYWRIGHT_MODULE_PATH 可指向已安装的 Playwright；默认浏览器通道 msedge。
node scripts/verify-combat.mjs
git diff --check
```

以上全部实际运行并通过。浏览器测试使用本地提供的 Playwright，不安装依赖；`--mini-only` 模式无需浏览器。浏览器失败时会退出并关闭测试服务器。

| 检查 | 实际结果 |
| --- | --- |
| JS / JSON / 竖屏配置 | PASS |
| 7 槽、锁定后的升级候选与上限 | PASS |
| 自动射击、枪口内侧贴身命中、无目标空窗后不积压补射 | PASS |
| 走/跑、停下与撞边收腿、真实键盘和触屏摇杆输入 | PASS |
| 暂停、升级、失焦/后台、致命接触停止射击、死亡/胜利冻结、重开 | PASS |
| 浏览器模拟 179 秒战斗 | PASS，Edge 154.0.4258.48，390×844，桌面峰值 160、触屏峰值 104 |
| 小程序 wx 桩模拟 179 秒 | PASS，峰值 84；随后验证标准 104 / 省电 72 的生成与裁剪上限 |
| 世界边缘安全生成、既有普通感染者随时间加速 | PASS，逻辑环境 |
| 179 秒仍运行、180 秒胜利并冻结 | PASS，双端 |
| 普通网页隐藏管理员面板/API | PASS |
| 四方向持枪、僵尸直立/前伸手臂/弯膝截图 | PASS，实际查看；姿态截图使用管理员冻结场景 |
| 实际浏览器动画循环 | PASS，约 5.5 秒，22 次自动射击；未据此宣称低端手机性能通过 |

本地证据：`evidence/local/firearms-motion/results.json`、`live-sample.json`、压力/胜利截图、四方向姿态截图。该目录被忽略，未提交。最终手臂姿态补丁后重新执行仓库门禁并重新查看姿态截图；此前完整功能回归覆盖相同战斗逻辑。

## 未执行与风险

- 微信开发者工具编译、微信真机、三分钟真人试玩、低端手机压力与线上检查：NOT RUN。
- wx 桩只验证页面逻辑和接口调用，不能代替真实 Canvas 兼容性或真机视觉。
- 模拟秒数不是实际设备持续运行时长；压力峰值不是手机 FPS 测量。
- 双端保留原有不同技能候选与求生本能实现；本轮统一主枪、直立动作和三分钟基础时间规则。
- GitHub Issue、推送与 PR：BLOCKED，等待仓库地址；`main` 未更新。
- 小程序体验版仍使用占位 AppID，没有上传记录。
