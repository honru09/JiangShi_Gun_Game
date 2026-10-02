# 道具球、房屋探索与枪械拾取

## 本地任务约定

- 用户目标：将升级三选一改为场景随机道具球；捡到同类道具提升等级和效果。
- 追加目标：可以进入房屋搜索道具与新枪械，室外品质较低，房屋内品质较高。
- 沿用用户此前确认的网页优先范围；小程序暂停更新。
- 基线：`2ac8bc4`，保留四倍面积城市地图、建筑碰撞、镜头跟随、自动枪械与三分钟撤离。
- GitHub 远程尚未配置，无法获取远程 Issue 或创建 PR。此文件记录离线任务的目标、独占范围与验收。
- 不修改 `main` 或其他聊天的分支、未提交文件。

| 任务分支 | 独占写入范围 | 目标 |
| --- | --- | --- |
| `work/web/loot-gameplay` | `prototype-2d/index.html`、`skills.js`、`loot-system.js` | 道具球、品质、枪械、房屋交互与场景状态 |
| `work/web/house-interiors` | `prototype-2d/house-system.js`、`city-map.js` | 可达入口、房间、搜索点与绘制 |
| `work/tests/loot-regression` | `scripts/verify-loot.mjs`、`verify-skills.mjs`、`verify-combat.mjs`、`prototype-2d/tests/**` | 实际页面逻辑、浏览器与城市回归 |
| `work/codex/loot-integration` | `STATUS.md`、`prototype-2d/README.md`、`docs/**`、`scripts/validate.mjs` | 契约、合入、验收、交付记录 |

## 规则

1. 开局只有基础枪械与求生本能，战术三槽、增益两槽由拾取填充。
2. 场景定时与击杀随机掉落道具球；接触球获得对应道具，重复拾取增加等级，核心最高五级、增益最高三级。
3. 道具球与经验分开：经验推进幸存者等级并提供场景补给；升级不再弹窗、不暂停战斗。
4. 室外掉落品质为普通、精良；房屋搜索品质为精良、稀有、史诗。品质提升实际属性，同类低品质拾取不会降低已有品质。
5. 战术或增益满槽后，不能新增该类技能；满级重复拾取或容量不允许的道具提供替代奖励与反馈。
6. 枪械包含突击步枪、冲锋枪、霰弹枪，拾取后可以装备；当前枪械与品质在界面可见。
7. 靠近入口使用 E 或屏幕交互按钮进入房间，靠近搜索点搜寻，靠近出口返回城市。房屋分为平房、楼房和小院，部分外观破损；房间活动范围按房型不同。
8. 每个搜索点每局只能搜索一次；进出房屋保留已搜索状态及场景掉落，不重复生成奖励。
9. 房间探索期间倒计时继续、感染者仍可进入。暂停、死亡及撤离结算停止移动、拾取和搜索。
10. 重开清空技能、品质、枪械与房屋搜索状态；室外建筑碰撞、感染者绕行及镜头规则保持有效。

## 验收命令

- `node scripts/validate.mjs`
- `node scripts/verify-loot.mjs`
- `node prototype-2d/tests/combat-smoke.mjs`
- `node prototype-2d/tests/city-map-smoke.mjs`
- `node scripts/verify-combat.mjs --web-only`
- `git diff --check`

## 实际结果

2026-10-02 实际结果：`verify-loot.mjs --unit-only` 与授权 Edge 390×844/320×568 PASS；`city-map-smoke.mjs`、`verify-combat.mjs --web-only` PASS。`validate.mjs` 仅保留既有小程序竖屏配置失败，未修改小程序。

## 验证边界

浏览器与模拟逻辑验收不等同于真人三分钟试玩、手机性能、微信真机或线上发布。没有 GitHub 远程时不宣称已推送、已创建 Issue / PR 或已合并。
