# GPT Obsidian Tracker v0.1.0 交付报告

核验日期：2026-09-12。状态：**核心实现与自动化验收通过，等待真人 ChatGPT 验收**。

## 项目与运行

- 项目根目录：`D:\Projects\GPT-Obsidian-Tracker`
- 实现提交：`0b0eeacaf3a340aba4fdfdc05a34463e21741a21`（main）；文档收尾提交另见 `git log -1`。
- 开发提交历史：`75a08f9` 初始化与审计 → `b701e9f` 核心功能 → `ba40473` 恢复能力、脚本、Vault 集成 → `0b0eeac` 扩展状态请求修复。
- Collector 启动：双击 `D:\Projects\GPT-Obsidian-Tracker\start.bat`，或 `scripts\start.bat`。
- Collector 当前已通过真实 `scripts\start.bat` 启动，监听 `127.0.0.1:17321`。`scripts\stop.bat` 安全退出已经实际验证。
- 浏览器加载目录：`D:\Projects\GPT-Obsidian-Tracker\apps\extension\dist`
- SQLite：`D:\Projects\GPT-Obsidian-Tracker\data\tracker.sqlite3`
- Node：`D:\Node.js\node.exe`，v24.14.0。
- 所有代码、依赖、构建、SQLite、日志、备份、浏览器验收配置、测试临时数据均位于 D 盘。没有创建服务、注册表项、启动项或计划任务。

## 最终目录树

```text
D:\Projects\GPT-Obsidian-Tracker
├─ apps
│  ├─ extension
│  │  ├─ src                   content / background / popup
│  │  ├─ dist                  可加载的 Manifest V3 扩展
│  │  ├─ manifest.json
│  │  └─ popup.html / popup.css
│  ├─ collector
│  │  ├─ src                   API / sessions / SQLite / config / logger
│  │  └─ migrations            001_initial / 002_session_message_versions
│  └─ mcp-server
│     └─ src                   stdio server / 8 个只读查询
├─ packages
│  ├─ shared
│  ├─ chatgpt-parser
│  ├─ activity-engine
│  ├─ obsidian-writer
│  └─ summary-engine
├─ scripts                     Windows 启停构建、集成、验收、管理工具
├─ tests                       activity / parser / session / writer / service
├─ config
│  └─ default.json
├─ docs
│  ├─ TASK.md
│  ├─ VAULT-AUDIT.md
│  ├─ ACCEPTANCE.md
│  ├─ RELEASE-REPORT.md
│  └─ evidence                 本次验证结果
├─ dist                        collector.js / mcp-server.js
├─ data                        正式 SQLite、认证令牌、验收浏览器配置
├─ logs                        4 类轮转日志
├─ backups                     自动修改前的原始字节备份
├─ work                        隔离测试数据库、Vault、浏览器证据
├─ .cache                      npm、Chromium、临时文件
├─ node_modules
├─ README.md
├─ PROGRESS.md
├─ start.bat
├─ package.json / package-lock.json
├─ tsconfig.json / vitest.config.ts
└─ eslint.config.js / .gitignore / .gitattributes / .npmrc
```

## 自动化结果

| 检查              | 实际结果                                                          |
| ----------------- | ----------------------------------------------------------------- |
| Vitest            | **81 / 81 passed**，5 个测试文件                                  |
| TypeScript strict | passed                                                            |
| ESLint            | passed                                                            |
| 构建              | Collector、MCP、Extension passed                                  |
| MCP 协议          | 真实 stdio 握手，8 / 8 工具调用通过                               |
| SQLite            | 2 个 migration、重复消息、事务回滚、恢复、跨会话消息版本测试通过  |
| 写入恢复          | 备份 SHA-256、冲突拒绝、撤销、prepared 日志恢复、重复同步测试通过 |
| 热力图            | 两处实际集成后的 DataviewJS 源码执行测试通过                      |

测试修复包含：SQL 占位符、结束后重复开启、后续编辑污染旧会话证据、跨午夜统计、手动分类优先、分类字段残留、保留待办勾选、空白浏览不计学习、扩展内部页面的状态请求。

## 浏览器端到端结果

实际运行 Chromium + 实际打包扩展 + 独立 Collector 进程 + SQLite + Markdown 写入。ChatGPT 地址被测试路由替换为合成 HTML，因此**这是合成页面端到端测试，不是真人 ChatGPT 五分钟验收**。

- 捕获 2 条 User / Assistant 测试消息。
- 初始前台累计 9.093 秒。
- 后台稳定观察段有效时间增量 **0 秒**。
- 返回后有效时间增加到 17.996 秒。
- 结束时有效时间 **20.782 秒**。
- 每日汇总 `ai_minutes = 0.3464`，与秒数除以 60 后四舍五入一致。
- 分类为高等数学，topic 为偏导；UTF-8 中文标题、消息、文件名正常。
- 会话笔记、每日汇总、Daily Note 机器区块和 daily-stats.json 均在**隔离 Vault**生成。
- Collector 退出并重新启动，Session 秒数保持不变。
- popup 已实际加载并截图检查，显示 Collector Connected。

测试运行目录：`D:\Projects\GPT-Obsidian-Tracker\work\browser-e2e-c8c6c70d-719e-4997-be79-6c934f3af184`。没有将该测试的分钟数或聊天写入真实 Vault。

## 真实 Obsidian 修改

已新增：

1. `D:\Obsidian\warehouse\学习记录\AI交互\数据\使用说明.md`
2. `D:\Obsidian\warehouse\学习记录\AI交互\数据\daily-stats.json`（目前为空对象）

已备份后修改：

1. `D:\Obsidian\warehouse\首页\启动首页.md`：追加机器管理的 GPT 查询区块，原始内容完整保留为前缀。
2. `D:\Obsidian\warehouse\首页\学习热力图.md`：现有 DataviewJS 增加自动每日汇总来源。
3. `D:\Obsidian\warehouse\Obsidian配置\Dashboard\组件\60_学习热力图.md`：同样增加自动每日汇总来源。

审计范围 35 份原文件，预定 3 份改变，其他 32 份 SHA-256 未变。备份文件哈希与修改前一致。没有修改主题、插件配置、既有 Daily Note 或其他笔记。

目前**没有真实学习会话 Markdown、每日学习汇总或 Daily Note 学习区块**。因为用户尚未进行验收对话。正式数据库有 1 条空白首页观察（3.77 秒、0 消息），已标记 ignored，不计入任何学习分钟，也未导出笔记。

## 热力图与人工数据

保留原来从「日常记录」读取的手工分钟；另从「学习记录/AI交互/每日汇总」读取数值 `ai_minutes`，按日期相加。实际源码测试：手工 10 + 自动 7 = 17，测试数值不保存到 Vault。

没有改 Daily Note 原有 frontmatter，避免覆盖人工记录。后续每个会话同步时只更新 `GPT_TRACKER_START / END` 机器区块。已有 Dataview、Tasks、Tracker、Calendar 被复用，没有安装 Heatmap Calendar 或重复插件。同一时段请不要再次手填到原学习分钟字段，系统不猜测手工分钟的时间区间。

## 待完成与使用边界

1. **真人 ChatGPT 约五分钟验收尚未完成。**独立验收浏览器已打开真实 ChatGPT 未登录首页，未自动发送任何 Prompt。需要用户实际对话、切出再返回、结束同步后继续核对。
2. **云端总结未开启也未实测。**默认 none / enabled=false；没有密钥仍可记录。Provider 已实现并测试请求格式与 JSON 校验，不能将这等同于真实服务商效果验收。
3. **Obsidian 原生窗口渲染未作人工确认。**已对两处实际 DataviewJS 源码进行数据测试；未把它称作原生 UI 验收。
4. ChatGPT 私有 DOM 会变化；出现 `PARSER_DEGRADED` 时不写错误消息。真实页面消息结构还需真人会话确认。
5. SQLite 的 Node 24 API 在运行时有 ExperimentalWarning；当前版本的构建、数据库、协议与 E2E 检查已通过。
6. 离线关闭网页可能丢失尚未发送的消息；最后心跳有最多 30 秒的观测窗口。文件原子替换不能提供跨应用编辑锁，但有内容冲突检查和恢复备份。

完整操作、暂停/软删除/恢复/卸载、API 与 MCP 配置见根目录 README.md。接续工作看 PROGRESS.md；无需重新初始化。
