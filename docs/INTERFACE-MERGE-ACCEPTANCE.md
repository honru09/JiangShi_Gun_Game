# 界面窗口合并验收

日期：2026-10-14（Asia/Shanghai）

## 目标与来源

将“界面”窗口最后交付的 `work/codex/role-merge-20261011@e11ef8a` 合入当前网页游戏并上传 GitHub。

- 来源窗口：`01a0fb15-fb8b-71d1-beca-6237a0b4b0b1`，标题“界面”。
- 集成基线：`work/codex/firearms-integration@95eac8c`，开始改动前已确认推送。
- 任务分支：`work/codex/interface-integration-20261014`。
- 范围：[Issue #1](https://github.com/honru09/JiangShi_Gun_Game/issues/1)，网页、验收脚本与状态文档；微信实现只读。
- 仓库当前默认分支为 `work/codex/firearms-integration`，尚无 `main`，PR 以默认分支为目标。

早期界面美术已在基线祖先中，本次只整合最新完成交付。旧工作区未提交的180秒、自动开火和三选一版本不作为本次来源。

## 实现

- 六种暖色末世室内，包含商店、住宅、高楼一层和庭院等；前后双门，建筑外观与屋顶适配人物比例。
- 室内和街道使用同一世界坐标、画布与相机；直接步行进出，家具和搜索状态持久化。双门碰撞与感染者追击接入当前玩法。
- 23张透明PNG，用于场景拾取与装备栏；保留搜索物资和新增枪械的SVG图标，避免全局模块重名覆盖。
- 手雷、燃烧瓶、捕兽夹、灭火器的实际释放和场景特效；灭火器扇形区域持续5秒、减速40%，局部灭火。
- 主角双臂层级和掌心投掷，冲锋枪缩放与手部位置一致；无第三条投掷手臂。
- 弹道从玩家中心覆盖第一段行程，修复贴身漏判；门洞可射击，全部房屋墙体和家具保持挡弹。
- 图片延迟或失败时，拾取物保留符号和标签、栏位保留SVG/符号、手持灭火器保留Canvas图形；图片恢复后自动刷新栏位。
- 角色图集失败时，简化角色复用相同两臂骨架与掌心位置，四种道具动作和手持工具保持可见。
- 触屏装备栏避开摇杆、开火和背包按钮。

当前横屏、手动开火、300秒战斗、枪械弹匣/备弹、物资逐项搜索、5×8背包和0.5%僵尸临时增益掉落保持通过回归。

## 改动文件

| 文件 | 内容 |
| --- | --- |
| `prototype-2d/index.html` | 模块接线、双门、弹道、角色动作、道具特效、HUD与加载兜底 |
| `prototype-2d/art-assets.js`、`city-map.js`、`house-system.js` | 建筑美术、地图留白、六类室内与双门 |
| `prototype-2d/assets/items/*.png`（23张）、`item-art.js`、`item-effects.js` | 道具透明图、加载绘制与特效 |
| `prototype-2d/character-art.js` | 双臂层级、投掷及手持工具绘制接口 |
| `prototype-2d/inventory-art.js`、`loot-system.js`、`skills.js` | 命名隔离、拾取图与后备显示、技能说明 |
| `prototype-2d/tests/character-anatomy.mjs`、`character-motion-smoke.mjs` | 骨架与网页/微信适配器动作回归 |
| `prototype-2d/tests/combat-smoke.mjs`、`door-combat-smoke.mjs` | 贴身、双门和墙/家具射击回归 |
| `prototype-2d/tests/house-art-smoke.mjs`、`loot-smoke.mjs` | 房屋契约及搜索窗口测试适配 |
| `prototype-2d/tests/item-art.mjs`、`item-effects.mjs`、`item-integration.mjs`、`item-visual-smoke.mjs` | 图片、特效、实际动作与浏览器验收 |
| `scripts/validate.mjs` | 增加道具模块语法检查 |
| `STATUS.md`、本文 | 真实状态和验收记录 |

## 实际运行

下表均为本轮实际执行结果。逻辑模拟与实际浏览器验收分别标注。

| 命令 | 结果与范围 |
| --- | --- |
| `node scripts/validate.mjs` | PASS，网页/微信JS语法、JSON与入口配置；不等同于玩法测试 |
| `node scripts/verify-loot.mjs --unit-only` | PASS，识别进度、领取/使用、40格占格/拖拽/取消及掉落规则 |
| `node prototype-2d/tests/inventory-reference-smoke.mjs` | PASS，当前搜索背包契约 |
| `node prototype-2d/tests/landscape-controls-smoke.mjs` | PASS，横屏、摇杆与手动开火/输入释放 |
| `node prototype-2d/tests/combat-smoke.mjs` | PASS，72个贴身射击场景、运动/死亡、160/104上限、299秒继续与300秒结算/重开 |
| `node prototype-2d/tests/door-combat-smoke.mjs` | PASS，12个双门射击场景与18个墙/家具/邻屋阻挡场景 |
| `node prototype-2d/tests/city-map-smoke.mjs --unit-only` | PASS，六房屋、半径24连通、感染者绕障、同世界连续进出、相机与弹道 |
| `node prototype-2d/tests/house-art-smoke.mjs --unit-only` | PASS，六类布局与96条半径24通行路径 |
| `node prototype-2d/tests/character-anatomy.mjs` | PASS，72119个骨架姿态 |
| `node prototype-2d/tests/character-motion-smoke.mjs` | PASS，真实网页/微信骨架适配器；微信实现未改 |
| `node prototype-2d/tests/item-art.mjs --integration` | PASS，23图注册、加载/失败/重试及拾取物可辨识兜底 |
| `node prototype-2d/tests/item-effects.mjs` | PASS，场景特效与Canvas状态 |
| `node prototype-2d/tests/item-integration.mjs` | PASS，实际自动释放、掌心连贯、灭火扇形/40%减速/5秒、状态计时与PNG透明像素 |
| `node prototype-2d/tests/item-visual-smoke.mjs` | PASS，Edge实际释放及场景特效、暂停画面冻结、7格图片、844×390栏位避让、延迟/失败可玩与重试自动更新；角色/道具图片同时失败时四种动作仍可见 |
| `node prototype-2d/tests/house-art-smoke.mjs --browser-only` | PASS，Edge实际六种室内/室外画面、双门步行贯通 |
| `node scripts/verify-loot.mjs --browser-only` | PASS，Edge的1280×720、960×540、844×390搜索/背包/拖拽/暂停/物理房门 |
| `node prototype-2d/tests/visual-integration-smoke.mjs` | PASS，Edge实际首帧美术、六屋同世界连续进出、390×844无横向溢出、环境图片失败可玩，无脚本错误 |
| `git diff --check` | PASS |

浏览器使用本机Edge和配置的Playwright模块，证据在本机忽略目录 `evidence/local/item-art/`、`house-art/`、`scene-loot/`、`window-integration/`；不上传本机证据与个人运行配置。

## 限制

- 微信真机、真人五分钟试玩、本轮新公网发布：NOT RUN。
- 《阿皮大冒险》完整物资数值及背包规则对照属于既有未完成需求，本轮保留当前玩法，不宣称完成原作全部复制。
- `.github` 工作流尚未纳入仓库；此处PASS是本机实际验收结果，不代表GitHub自动检查结果。
- 临时公网依赖原有本机服务与隧道进程，本次未新建或验证公网地址。
- 上传使用本机既有GitHub认证，未加入密钥、公钥、个人配置或历史未跟踪目录。
