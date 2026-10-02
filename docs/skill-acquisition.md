# 网页技能获取与城市地图调整

## 本地任务约定

- 用户目标：技能界面减少杂乱，参考《弹壳特攻队》的局内获取方式。
- 用户已确认先在独立本地分支完成；仓库没有 GitHub 远程，此轮不创建 Issue / PR。
- 用户随后收窄范围：只更新网页端，小程序端暂停更新。
- 用户追加目标：地图扩大三到四倍，增加现代城市街区和房子；按四倍面积实施，视窗保持原尺寸并跟随角色。
- 基线：`f243d22`，包含已完成的枪械、渐进尸潮与三分钟撤离逻辑。
- 集成分支：`work/codex/skill-acquisition`。
- 网页写入：`prototype-2d/index.html`、`skills.js`、`README.md`；新增城市地图模块 `prototype-2d/city-map.js` 由独立分支 `work/web/city-map` 完成。
- 测试写入：`scripts/verify-skills.mjs`、`scripts/verify-combat.mjs`、`prototype-2d/tests/combat-smoke.mjs`、`prototype-2d/tests/city-map-smoke.mjs`，独立分支 `work/tests/skill-acquisition`。
- 集成补充：本说明。早期集成的小程序页面改动已撤回；小程序配置也恢复基线。

## 规则

1. 开局只有突击步枪与求生本能；无需战前选择技能。
2. 经验升级时，随机提供最多三项，从中选择一项新获取或强化。
3. 战术最多三项、增益最多两项；新技能从一星起，强化增加一星。
4. 战术最高五星，增益最高三星。满槽不出现同类新技能，满星不再出现。
5. 候选不足三项按实际数量展示；全部满星后升级转为治疗。
6. 选择期间战斗冻结，连续升级全部选完再恢复；重开清空成长槽。
7. 战斗技能栏分为基础二槽、战术三槽、增益二槽；使用短标识与星级，详细说明放在选择卡中。
8. 可探索世界为 1440×2560，含现代街道与房屋；镜头跟随，建筑碰撞与感染者绕行，刷怪围绕当前视野。

## 验收

- `node scripts/validate.mjs`
- `node scripts/verify-skills.mjs`
- `node prototype-2d/tests/combat-smoke.mjs`
- `node prototype-2d/tests/city-map-smoke.mjs`
- `node scripts/verify-combat.mjs --web-only`
- 浏览器手机视口检查新技能卡、分组技能栏及暂停技能说明。

实际执行结果与局限在完成验证后补充。仓库验证包含小程序既有的竖屏声明检查；该端暂停更新时需如实记录其基线失败项。

## 保留边界

- 本轮不增加技能合成或超武进化。
- 小程序继续使用本轮之前的技能获取逻辑，未纳入本次网页交付；双端技能池差异仍需后续统一。
- 不修改 `main`，不修改其他聊天的工作分支或未提交文件。
