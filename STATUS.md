# 《尸潮：最后一夜》项目状态

**LAST NIGHT SURVIVOR**  
更新时间：2026-10-13（Asia/Shanghai）

## 当前交付

- 当前项目：`F:\Project\Xiyou_EightyOne_Calamities`，横屏 2D 网页与原生微信小程序原型。
- 网页已集成“界面”“玩法”“角色样式”三个窗口的完成内容，并接入横屏摇杆、手动开火、枪械弹药和搜打撤物资箱。
- 网页单局 **300 秒**，生命归零失败，到时撤离成功；结算冻结战斗并支持重开。
- 微信小程序保留 **180 秒**战斗原型，本轮只合入已完成的角色帧与素材失败兜底修复，未扩展网页房屋与掉落玩法。

## 合并后的功能

| 模块 | 当前事实 |
| --- | --- |
| 统一美术 | 保留界面窗口的暖色手绘环境和角色图集；建筑、树木与人物按深度排序 |
| 首帧一致 | 浏览器等待环境图集和正在使用的角色图集就绪后才允许开局；失败/超时显示重试，运行中不切换简化房屋 |
| 城市 | 1440×2560 世界、1280×720 横屏视口、六栋放大房屋、六地块、1纵2横道路；贴图按建筑类别对应 |
| 房屋 | 室内与街道处于同一世界，直接走门连续进出，隐藏当前房屋屋顶并保留邻屋和室外景物；家具、搜索点与房屋状态持久化 |
| 寻路 | 房屋走廊与门洞加宽，室内外感染者可持续追击；家具和墙体阻挡移动与弹道 |
| 构筑 | 1格主武器、4格被动道具、2格增益；求生本能保留在构筑/暂停表；经验升生存等级，道具球获取/升级技能；Space/右侧按钮手动开火 |
| 自动道具 | 手雷、燃烧瓶、捕兽夹、灭火器自动释放；灭火器从手部喷出扇形场，持续5秒、减速40% |
| 掉落 | 普通场景升级球按室外品质，室内升级球按室内品质；物资箱暂保留披萨、牛奶、弹药、杂物四件原型物资，完整原作物资表待核验；击杀只有经验与0.5%概率的一次性临时增益 |
| 搜打撤 | 背包默认 5 列×8 行（40 格）；真实占格、空格移动及交换校验；箱内保存物资与识别进度；搜索/背包并排、显式领取和使用、拖出丢弃；完整原作规则尚未对齐 |
| 角色 | 命名两帧walk/run/crawl及跳跃阶段；左右瞄准肩掌连接、双臂层级、爬行者双臂双腿完整；重型腾空免接触伤害 |
| 数量上限 | 网页桌面160、触屏104；微信标准104、省电72；室内另有18感染者局部上限 |

## 2026-10-13 背包与搜索修复

用户要求完整复现《阿皮大冒险》的全部物资和背包。**该要求尚未完成**：目前只能核实新手箱四件物资的名称，缺少完整物资清单、背包容量/占格/堆叠/装备/局外仓库规则和数值。保留原型数据并明确标注，不把推测物资当作已复制的原作内容。

本轮完成：搜索箱内容与地面掉落分离；关闭/暂停不再绕过识别；识别进度可续接；已领取物资不可重复领取；搜索和背包并排；单件/批量领取；固定格位、保留空隙、尺寸和交换校验；独立使用与丢弃；部分弹药保留；杂物不可误消耗；拖拽取消/标题松手/暂停/结算保护。

### 本轮实际运行

- `node scripts/validate.mjs`：PASS。
- `node scripts/verify-loot.mjs --unit-only`：PASS，更新断言后直接运行实际网页脚本，调试拾取与正式拾取行为一致。
- `node prototype-2d/tests/landscape-controls-smoke.mjs`：PASS。
- `node prototype-2d/tests/combat-smoke.mjs`：PASS，包括 300 秒结算、160/104 上限和暂停。
- `node prototype-2d/tests/city-map-smoke.mjs --unit-only`：PASS，同世界进出与室内路径保持。
- 内置浏览器：PASS，844×390 视口下实际操作搜索/背包、单件与批量带入、两格移动/跨行拒绝、标题取消、显式使用、拖出丢弃、暂停恢复；截图 `evidence/local/scene-loot/inventory-phone-preview.jpg`。
- 新临时公网：PASS，HTTP 200，响应内容与当前 `prototype-2d/index.html` 完全一致，`Cache-Control: no-store`。
- `node scripts/verify-loot.mjs --browser-only`：**未完成**，Edge 启动权限请求未获批准。新增的 3 尺寸与触屏取消自动验收尚未完整执行，不能沿用上轮浏览器 PASS。
- 微信真机、真人五分钟试玩、原作逐项对照：**NOT RUN**。
- `git diff --check`：PASS。当前任务分支已推送到 `https://github.com/honru09/JiangShi_Gun_Game.git` 的 `work/codex/firearms-integration`；未更新 `main`。

改动文件：`prototype-2d/index.html`、`loot-system.js`、`README.md`、`tests/loot-smoke.mjs`、`tests/combat-smoke.mjs`、`tests/city-map-smoke.mjs`、`tests/inventory-preview.html`、`scripts/verify-loot.mjs`、`STATUS.md`。

## 上轮集成验证（历史结果）

| 验证 | 结果与范围 |
| --- | --- |
| `node scripts/validate.mjs` | PASS：网页/微信脚本、JSON、横屏配置、入口 |
| `node prototype-2d/tests/combat-smoke.mjs` | PASS：300秒结算、重开、7槽、射击、移动、暂停、死亡、160/104上限与四种运动协议 |
| `node prototype-2d/tests/city-map-smoke.mjs --unit-only` | PASS：六房屋、室内连通、半径24通行、地图绕行、同世界进出、横屏相机与手动弹道 |
| `node prototype-2d/tests/landscape-controls-smoke.mjs` | PASS：1280×720 横屏、左侧摇杆、右侧手动开火、Space、暂停/失焦释放 |
| `node prototype-2d/tests/loot-smoke.mjs --unit-only` | PASS：4类阿皮式物资箱、背包与弹药、绿色撤离、死亡清包、4/2容量、自动投掷物、临时增益、结算冻结 |
| `node scripts/verify-loot.mjs --unit-only` | PASS：真实网页脚本模拟回归 |
| `node scripts/verify-combat.mjs --mini-only` | PASS：真实PNG裁剪边界、微信桩战斗/动作、180秒结算及重开 |
| `node prototype-2d/tests/character-motion-smoke.mjs` | PASS：网页/微信7瞄准角肩掌、两帧走跑爬、跳跃阶段、双臂双腿与停止归位 |
| `node prototype-2d/tests/visual-integration-smoke.mjs` | PASS：Edge实际浏览器；延迟图集时禁止开局、失败重试恢复、第一帧即精细场景、全部六屋连续进出、390×844无横向溢出；无页面脚本错误 |
| 临时公网验收 | PASS：公网页面HTTP 200且内容与当前目录一致；Edge实际通过公网开局，300秒、六栋房屋、两类素材就绪、无脚本错误 |
| `git diff --check` | PASS |

上轮使用工作区内置 Playwright 与 Edge 运行 `scripts/verify-loot.mjs --browser-only`：PASS，1280×720 与 960×540 均完成搜箱、逐项识别、关闭窗口后拾取、背包打开、拖出丢弃、暂停、进出房屋和重开；页面无脚本错误。该验收仍不等同于微信真机试玩。

浏览器截图和报告在本机 `evidence/local/window-integration/`，不会提交。逻辑模拟不代表微信真机或五分钟真人试玩。

## 来源与协作

- 界面窗口美术提交已在基线 `3d28b31` 中；保留环境图集与主题。
- 最新玩法来自 `work/codex/house-scale` 的 `9563199`，前置 `dfb2928`。
- 地图整合提交 `6644c7b`，角色整合 `d47fb9d`，角色回归测试 `f4b2187`。
- 原项目未提交文件已保存到 `work/integration-backup-20261009/` 与名为`Preserve pre-integration root edits 2026-10-09`的Git stash；历史未跟踪设计、证据、个人文件保留。
- 当前目录分支`work/codex/firearms-integration`正在整合横屏、枪械弹药和阿皮式物资箱更新；本轮改动尚未更新`main`。
- 所有窗口每次更新必须验收、提交、推送任务分支并创建/更新PR，见 `AGENTS.md` 和 `COLLABORATION.md`。
- GitHub：已配置 `origin` 为 `https://github.com/honru09/JiangShi_Gun_Game.git`，并成功推送 `work/codex/firearms-integration`。后续继续推进前先推送当前已验收版本；`main` 仍只通过 PR 更新。

## 上线与限制

- 当前保留测试地址：[进入试玩](https://j3bhee-ip-66-90-98-34.tunnelmole.net/)，本地入口`http://127.0.0.1:8080/`。旧地址曾出现 504，已清理旧客户端并用单一持续会话重建；后续开发另开新隧道，不覆盖此地址。
- 使用其他窗口采用的Tunnelmole；Cloudflare在本机出现边缘连接TLS握手失败，未采用其不可达地址。
- 服务直接使用当前项目的`prototype-2d/`，禁用静态缓存，网页进程7552；隧道保持在持续会话中；本地进程信息及日志在忽略目录`work/runtime-current/`。素材较慢时前端会启用 Canvas/矢量兜底，不会因 30 秒门限卡死。
- 仅公开`prototype-2d/`静态网页；密钥、Git与项目内部文件不通过服务目录公开。
- 微信开发者工具编译、真机预览、体验版上传：**NOT RUN**。仍为`touristappid`。
- 临时隧道依赖本机服务和隧道进程持续运行，不是永久托管。无多人联机或状态同步。
