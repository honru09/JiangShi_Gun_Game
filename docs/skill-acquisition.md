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

## 实际验证结果（2026-10-02）

| 检查 | 结果 |
| --- | --- |
| `node scripts/validate.mjs` | 失败 1 项：小程序既有 `app.json` 未声明 `window.pageOrientation=portrait`；其余 JavaScript、JSON 和项目目录检查通过。按用户要求不修改该端，仓库总门禁未通过。 |
| `node --check prototype-2d/city-map.js` | 通过。 |
| `node scripts/verify-skills.mjs` | 网页模型与浏览器通过：仅两项基础技能、随机三选一、获取/升星、类别容量、满星与少量候选、非法选择、连续六次升级冻结、医疗补给、重开；390×844 和 320×568 界面通过。 |
| `node prototype-2d/tests/city-map-smoke.mjs` | 地图模型与浏览器通过：四倍面积、48 栋建筑、中央出生、碰撞/贴墙滑动、感染者绕房和墙边恢复、视窗跟随与四角限制、附近安全刷怪、墙体阻挡索敌/弹丸；手机四角人物均避开 HUD、摇杆和技能栏。 |
| `node scripts/verify-combat.mjs --web-only` | 桌面及触控浏览器通过：启动/移动/停止/暂停、贴身射击、179 秒模拟尸潮压力、160/104 感染者上限、180 秒撤离与结算冻结；普通入口隐藏调试工具。 |
| `node prototype-2d/tests/combat-smoke.mjs` | 集成后再运行通过：真实页面脚本的移动、墙体/世界边界、暂停、获取技能、贴身射击、死亡冻结、160/104 峰值、三分钟撤离及重开。 |
| `git diff --check` | 通过；小程序目录相对基线 `f243d22` 的差异为空。 |

城市模块另经独立模拟验证：可走网格连通、24 条绕行追击路线、184 个房侧玩家接近场景通过。静态地形只绘制一次。

浏览器检查使用本机已有 Playwright 和 Edge，测试时指定 `PLAYWRIGHT_MODULE_PATH`。截图与结果保存在工作树的忽略目录 `evidence/local/skill-acquisition/`、`evidence/local/city-map/` 和 `evidence/local/firearms-motion/`，不作为发布或真人试玩证据。

## 保留边界

- 本轮不增加技能合成或超武进化。
- 小程序继续使用本轮之前的技能获取逻辑，未纳入本次网页交付；双端技能池差异仍需后续统一。
- 不修改 `main`，不修改其他聊天的工作分支或未提交文件。
