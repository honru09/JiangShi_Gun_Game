# 《尸潮：最后一夜》协作指南

**LAST NIGHT SURVIVOR** 同时维护网页和微信小程序两个运行端，并可能由多人在同一工作目录协作。目标是小步、可回退、可复核，避免任何人覆盖其他人的未提交工作。

## 开始之前

1. 阅读 `STATUS.md`，确认当前事实、阻塞和下一步。
2. 阅读 `docs/ZOMBIE-SURVIVAL-DESIGN.md`，确认本次修改属于目标范围。
3. 查看现有改动；若目录尚未初始化 Git，由集成人先完成初始化，不要各自创建互不兼容的仓库。
4. 明确负责文件和平台，优先避免多人同时编辑同一文件。
5. 不处理、不覆盖与自己任务无关的修改。

## 统一术语

- 中文名只用《尸潮：最后一夜》，英文副标只用 `LAST NIGHT SURVIVOR`。
- 玩家单位称“幸存者”，敌对单位称“感染者”。
- 固定 7 槽称为：固定主武器“突击步枪” + 固定被动“求生本能” + 3 个核心战术技能 + 2 个生存增益。
- 旧版术语只允许出现在迁移说明中，不进入新界面、变量说明、测试标题或发布文案。

## 推荐负责范围

| 范围 | 主要路径 | 责任 |
| --- | --- | --- |
| 网页战斗 | `prototype-2d/` | 战斗循环、UI、特效、浏览器回归 |
| 微信小程序 | `wechat-miniprogram/` | 双端规则同步、开发者工具和真机验证 |
| 设计与测试 | `docs/`、`README.md` | 目标、验收口径、测试记录模板 |
| 集成与状态 | `STATUS.md`、根配置 | 合并协调、阻塞更新、发布事实 |

如果任务必须跨范围，先在 PR 描述中列出影响文件和同步策略。

## 分支命名

从最新的 `main` 创建短生命周期分支：

- `feat/web-infected-combat`
- `feat/wechat-infected-combat`
- `feat/tactical-effects`
- `fix/portrait-layout`
- `docs/testing-workflow`
- `chore/repository-bootstrap`

一个分支只解决一个可描述的问题。不要把大规模格式化、素材替换和玩法改动混在同一 PR。

## 标准 Git 流程

仓库建立后，推荐执行：

```powershell
git switch main
git pull --ff-only
git switch -c feat/short-topic
git status --short
```

修改与验证完成后：

```powershell
git diff --check
git status --short
git add <明确的文件列表>
git commit -m "feat: describe the focused change"
git push -u origin feat/short-topic
```

不要使用 `git add .` 无差别纳入密钥、缓存或他人的文件。不要执行 `git reset --hard`、`git clean -fdx`、强制推送或改写公共分支历史。

## 共享工作区规则

- 开始和结束任务时都查看 `git status --short`；没有 Git 时，至少核对目标文件时间和负责范围。
- 不切换会覆盖当前改动的分支，不删除未知的未跟踪文件。
- 修改前先确认文件没有被其他协作者占用；冲突时由集成人决定合并顺序。
- 只格式化自己触及的片段，不执行全仓自动重写。
- 网页和小程序规则变更必须说明另一端是“已同步”“待同步”还是“不适用”。
- `STATUS.md` 是唯一状态入口；合并后由集成人更新，避免多份文档互相矛盾。

## Pull Request 要求

每个 PR 至少包含：

1. **目的**：解决什么问题，对应哪个设计或测试条目。
2. **范围**：修改了网页、小程序、文档或配置中的哪些部分。
3. **行为变化**：幸存者、测试员或管理员能观察到什么变化。
4. **测试记录**：列出实际执行的命令、设备、视口和结果。
5. **未测试项**：明确写出未执行、受阻塞或需要人工验证的内容。
6. **风险与回退**：双端差异、性能风险及可回退点。
7. **证据**：必要时附截图、录屏、状态快照或体验版版本号；临时大文件不要提交。

推荐 PR 尺寸保持可在一次审查中理解。若同时改变规则和视觉，优先拆成两个 PR。

## 测试门槛

- 仅改文档：检查链接、命令、事实和状态措辞，不需要伪造运行时测试。
- 改网页：至少完成桌面浏览器冒烟和 390×844 竖屏检查。
- 改小程序脚本：至少执行 Node 语法检查和 JSON 解析，再在开发者工具编译。
- 改战斗或构筑规则：网页与小程序都要核对固定 7 槽、锁定构筑、升级上限和暂停行为。
- 改感染者密度或特效：记录目标设备、持续时间、感染者数量、明显掉帧/触控异常和错误日志。
- 准备体验版：必须完成 `docs/TESTING.md` 的微信发布前清单。

只能把实际执行过且有结果的项目标为通过。无法执行时写 `BLOCKED` 或 `NOT RUN`，并说明原因。

## GitHub 首次接入

当前状态以 `STATUS.md` 为准。若目录仍不是 Git 仓库，由集成人在确认 GitHub 仓库归属和远程 URL 后统一执行：

```powershell
git init -b main
git add <审核后的首批文件>
git commit -m "chore: bootstrap last night survivor prototype"
git remote add origin <CONFIRMED_GITHUB_REPOSITORY_URL>
git push -u origin main
```

不要猜测远程 URL，不要把访问令牌写入命令历史、配置文件、文档或提交。首次推送后，在 `STATUS.md` 记录远程地址、默认分支和实际提交 SHA。

## 微信凭据与私有配置

- `project.private.config.json`、本地开发者工具缓存和密钥文件已由 `.gitignore` 排除。
- AppSecret、上传私钥、二维码、短信验证码和账号凭据不得提交。
- 真实 AppID 不是登录凭据，但变更前仍需确认属于正确的小程序项目。
- 上传体验版只能由已登录且有权限的成员执行；PR 通过不等于微信上传成功。
