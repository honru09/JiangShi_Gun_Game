# 《尸潮：最后一夜》项目状态

**LAST NIGHT SURVIVOR**  
更新时间：2026-10-02（Asia/Shanghai）

## 当前交付

- 网页原型：`prototype-2d/`，竖屏 2D 城市生存战斗，单局 180 秒。
- 小程序：`wechat-miniprogram/` 保留旧版实现；按用户要求本轮暂停更新。
- 网页开局携带普通突击步枪与求生本能。经验只推进幸存者等级；局内升级改为场景道具球，接触拾取后获得同类技能或提升等级，不弹三选一窗口、不暂停战斗。
- 战术最多 3 项、增益最多 2 项；核心最高 5 级、增益最高 3 级。品质倍率普通 1、精良 1.2、稀有 1.5、史诗 1.9，离散数量按整数向上取整。
- 室外掉落普通/精良；房屋搜索掉精良/稀有/史诗。支持突击步枪、冲锋枪、霰弹枪换装，低于当前枪械品质的枪械转为医疗。
- 城市地图为 1440×2560，当前约 30 栋建筑，混合平房、楼房、小院与破损房屋；道路绘制有轻微弯曲和错位。建筑碰撞与感染者导航继续使用实际矩形数据。
- 房屋可从门口进入，室内有按房型变化的空间和 3 个搜索点；每个搜索点每局一次，出口返回街区，计时与室内感染者压力继续。

## 已完成验证

| 验证 | 结果 |
| --- | --- |
| `node --check prototype-2d/city-map.js` | PASS |
| `node --check prototype-2d/house-system.js` | PASS |
| `node prototype-2d/tests/city-map-smoke.mjs --unit-only` | PASS：30 栋、碰撞滑动、感染者绕行、四角镜头、索敌遮挡与安全生成 |
| `node scripts/verify-loot.mjs --unit-only` | PASS：道具球升级、品质实际效果、枪械换装、槽位上限、随机掉落、房屋搜索持久化、暂停/结算/重开 |
| `node prototype-2d/tests/combat-smoke.mjs` | PASS：网页脚本、移动、射击、死亡冻结、桌面 160/触屏 104 上限、179/180 秒结算与重开 |
| `node scripts/validate.mjs` | FAIL 1 项：既有小程序 `app.json` 未声明 `window.pageOrientation=portrait`；网页脚本、技能/房屋/掉落脚本和 JSON 其余检查 PASS。本轮未改小程序 |
| `verify-loot.mjs` 浏览器阶段 | BLOCKED：当前沙箱启动 Edge 返回 `spawn EPERM`；未把模拟结果写成浏览器通过 |

## Git 与协作

- 当前集成分支：`work/codex/loot-integration`。
- GitHub 远程尚未配置，无法创建 Issue、推送或 PR；没有宣称已发布。
- 页面玩法、房屋模块、测试和集成文档使用独立 worktree 完成后本地合入；`main` 未更新。

## 未执行与限制

- 微信开发者工具编译、真机预览、真人试玩和微信上传：NOT RUN。
- 浏览器完整视觉阶段受 Edge 启动权限限制；单元和真实页面脚本模拟已通过。
- 临时公网隧道只在当前会话有效，不代表稳定部署或线上服务。
- 低端手机、微信 Canvas 帧率和真实网络环境仍需设备验证。
