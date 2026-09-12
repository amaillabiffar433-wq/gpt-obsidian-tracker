# GPT → Obsidian 自动学习记录

Windows 本地优先学习记录器。浏览器扩展观察 ChatGPT 页面，Collector 将活动与消息存入 SQLite，结束后写入 Obsidian。页面不插入面板、不改变输入框、不自动发 Prompt。默认完全不调用云端总结。

## 启动

项目：`D:\Projects\GPT-Obsidian-Tracker`。需要 Node.js 24（本机已安装在 `D:\Node.js`）。

1. 本机已经安装依赖并构建。双击项目根目录 `start.bat`，或 `scripts\start.bat`。
2. 在 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions` 开启开发者模式，选择“加载已解压的扩展程序”。目录：`D:\Projects\GPT-Obsidian-Tracker\apps\extension\dist`。
3. 刷新已打开的 ChatGPT 标签页，正常使用。扩展图标 `REC` 表示会话记录中，`PAUSE` 表示暂停/忽略/解析降级，`OFF` 表示未连接或无会话。
4. 点击图标可暂停、忽略本次会话，或“结束并同步 Obsidian”。默认离开超过 20 分钟自动结束，每 30 秒执行一次同步队列。
5. 查看 Obsidian 原有 `首页/启动首页`、`首页/学习热力图` 和 `学习记录/AI交互`。

`REC` 表示记录会话存在，不表示后台状态仍在累计有效分钟。切出窗口或切换标签页会停止有效计时。

重新安装依赖（所有缓存保持在 D 盘）：

```powershell
cd D:\Projects\GPT-Obsidian-Tracker
$env:TEMP = "$PWD\.cache\tmp"
$env:TMP = $env:TEMP
npm.cmd ci
npm.cmd run build
```

首次构建会生成本机 Collector 随机认证令牌并放入本机构建的扩展；不要分享 `apps/extension/dist/background.js` 或 `data/collector-token`。换电脑或更换令牌后重新构建并重载扩展。`dist` 不提交 Git。Collector 只监听 `127.0.0.1:17321`，不需要开放防火墙端口。

## Vault 与现有首页

默认 Vault 为 `D:\Obsidian\warehouse`。配置在 `config/default.json`，私人覆盖写入 `config/local.json`（不提交 Git）。修改后重启 Collector；修改端口还需要重新构建并重载扩展。

```json
{
  "vaultPath": "D:\\Obsidian\\warehouse",
  "obsidian": {
    "sessionFolder": "学习记录/AI交互/会话",
    "dailyFolder": "学习记录/AI交互/每日汇总",
    "dataFolder": "学习记录/AI交互/数据",
    "dailyNoteFolder": "日常记录",
    "dailyNoteWeekday": true
  }
}
```

适配本 Vault 的集成命令是 `npm.cmd run integrate`。它只处理审计确认的三份文件：`首页/启动首页.md`、`首页/学习热力图.md`、`Obsidian配置/Dashboard/组件/60_学习热力图.md`，每次实际改写前保存 SHA-256 核验备份。其他 Vault 先调整集成脚本的目标，不能盲目运行。

- Session 文件名带稳定 UUID，不因标题相同重复创建。
- Daily Note 的机器区块为 `<!-- GPT_TRACKER_START -->` / `<!-- GPT_TRACKER_END -->`；其外文字、换行、frontmatter 不修改。找不到区块则追加。
- 自动分钟在独立每日汇总的数值字段 `ai_minutes`，数量为 `ai_sessions`。
- 两处现有热力图将原 Daily Note 手工分钟与自动每日汇总按日期相加。上方原有手工 KPI 保留，首页新增简洁 GPT 今日/本周、学习方向、最近记录、薄弱点查询。
- **同一学习时段不要再手填到原分钟字段中，否则手工分钟与自动分钟会叠加。**系统无法推断手写时间与自动时段是否重合。
- `daily-stats.json` 提供日期到 `{ minutes, sessions, categories, ... }` 的映射；跨午夜按实际活动片段拆分。
- 未启用 Heatmap Calendar，不安装额外插件；复用已启用的 DataviewJS、Tracker、Calendar。
- 会话 YAML 中手改 `category`、`topics` 后，下次同步会写回 SQLite 并重算每日分类。手工优先标记持久化。其他人工字段保留；手改会话生成正文后，自动系统保留该正文以保护笔记/勾选任务。

## 有效时间的含义

- 前台、窗口有焦点，近 5 秒有键盘操作：typing。
- 前台生成答案：generating。
- 近 180 秒有鼠标、滚动、键盘操作，或答案结束后 120 秒阅读窗口：reading。
- 超出上述窗口：idle；后台或窗口失焦：background。
- `effectiveMinutes = activeSeconds / 60`；只累计 typing + reading + generating。
- 每 5 秒心跳；事件之间按阈值切分，不把整个间隔一律算成当前状态。最后心跳超过 30 秒后全部视为后台，无数据期间不反向补时。浏览器强退/网络中断最多存在一个 30 秒观测窗口误差。
- 切换 conversation、正常关闭标签页、“结束并同步”、Collector 安全退出会结束会话；短暂切走只暂停；20 分钟连续无有效活动自动结束。
- 手动结束后，下一次新交互才开始新会话。暂停时不入库新聊天消息；忽略当前 conversation 直到切换 conversation。
- 没有捕获到任何消息的空白首页/登录浏览在结束时自动忽略，不导出学习笔记或计入统计。
- Collector 崩溃重启会恢复未结束会话，中断期间不计有效时间。

这是一套可解释的交互时间估算规则，不等于检测用户是否真正理解。精确秒数在 SQLite，展示分钟四舍五入。

## AI 总结（主动开启后才联网）

默认 `summary.enabled=false`、provider=`none`。没有 API Key 不影响记录；Session 为 `summary_status: pending`，掌握、薄弱点等没有证据时留空。

主动开启时，在 `config/local.json` 中加入：

```json
{
  "summary": {
    "enabled": true,
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "填写你的服务商支持的模型标识",
    "sendFullConversation": false,
    "maxChars": 16000
  }
}
```

项目根目录创建 `.env.local`：

```dotenv
SUMMARY_API_KEY=填写你的密钥
```

重启 Collector。可使用其他兼容 `/chat/completions` 与 JSON object 输出的服务。默认只发送最近 16 条消息的限长片段，最多 16000 字符；这仍包含聊天文本，主动开启前请自行确认服务商。`sendFullConversation=true` 使用全部消息候选，但仍受 `maxChars` 总上限约束。请求超时 45 秒，失败后至少 15 分钟再试；先保留记录，不阻断采集。不在日志中写密钥、请求或聊天正文。

总结只有通过 Zod 结构校验才入库。提示词明确要求仅依据用户实际作答判断掌握，不凭模型讲解虚构理解；摘要仍需人工判断。当前未配置真实 API，所以不声称已验证服务商调用效果。

## 数据、日志与隐私

| 数据                     | 位置                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| SQLite（WAL）            | `data/tracker.sqlite3`                                               |
| 聊天与历史修订           | SQLite messages / message_revisions                                  |
| 活动证据 / 分段          | SQLite activity_events / activity_segments                           |
| 会话与总结               | SQLite sessions / summaries                                          |
| 写入恢复记录             | SQLite sync_records + `backups/`                                     |
| 运行日志                 | `logs/collector.log`、`extension.log`、`obsidian.log`、`summary.log` |
| npm / 浏览器 / 临时缓存  | `.cache/`                                                            |
| 自动测试数据与隔离 Vault | `work/`                                                              |

以上全部以 `D:\Projects\GPT-Obsidian-Tracker` 为根。日志每份 2 MiB 轮转，保留 3 份历史。备份不自动删除，以免丢失撤销能力；自行按需要归档。没有系统服务、注册表、开机启动或计划任务。

扩展不在浏览器持久存储聊天全文；只把 browserId、暂停标志及重连状态写入扩展存储，未发送成功的消息通过仍打开页面的 DOM 重试。**Collector 离线时关闭页面，尚未入库的新消息可能丢失**；图标会显示 OFF，不把离线数据假称已保存。浏览器自身缓存属于浏览器，项目不会迁移用户现有 Chrome 配置；提供的验收浏览器配置完全位于 D 盘。

## 暂停、删除某次记录、恢复与卸载

暂停记录：扩展 popup “暂停”，或 `npm.cmd run admin -- pause`。继续为 `resume`。停止 Collector：窗口内 Ctrl+C，或双击 `scripts\stop.bat`。要完全停止采集，也可禁用扩展。

删除单次会话使用**可恢复的软删除**：popup “忽略本次会话”；已经结束的记录使用：

```powershell
# 先停止 Collector
npm.cmd run admin -- list
npm.cmd run admin -- ignore <session-id>
# 下次启动自动重算；笔记标记 ignored，从统计与查询中排除，聊天原文保留。
npm.cmd run admin -- restore <session-id>
```

撤销某次文件写入（先停止 Collector）：

```powershell
npm.cmd run admin -- sync-records
npm.cmd run admin -- undo <sync-record-id>
```

撤销按最新到最旧顺序执行。只有目标仍与生成时 SHA-256 完全一致才允许恢复；有人工修改则拒绝，手工从 `backups` 合并。新建文件撤销会先归档再移出 Vault。撤销整套集成后不要再运行 integrate。SQLite 仍保留的会话可能在下次启动重新导出，需先 ignore，或禁用/卸载扩展与 Collector。

完全卸载：关闭 Collector、从浏览器移除扩展；按需备份 SQLite 和 `backups`；撤销三份原页面的集成修改（或根据备份手动去掉新增数据源/机器区块）；自行选择是否保留 `学习记录/AI交互` 及 Daily Note 机器区块；最后删除项目目录。程序不会自动永久删除聊天或笔记。开机启动留待后续明确需要时再配置，本版本不自动创建。

## MCP（只读）

先启动一次 Collector 创建数据库。MCP 进程独立以 SQLite `readOnly` 模式运行，不执行 migration，不输出聊天原文结果，不提供写入工具。

```json
{
  "mcpServers": {
    "gpt-learning-tracker": {
      "command": "D:\\Node.js\\node.exe",
      "args": ["D:\\Projects\\GPT-Obsidian-Tracker\\dist\\mcp-server.js"],
      "env": { "TRACKER_ROOT": "D:\\Projects\\GPT-Obsidian-Tracker" }
    }
  }
}
```

工具：tracker_today、tracker_day、tracker_week、tracker_sessions、tracker_search、tracker_topics、tracker_weak_points、tracker_stats。week 为指定日期所在的周一到周日。可选 date、query、category、limit。仅在支持相应参数的查询使用；search 在本地全文匹配，返回会话信息及摘要，不把原文直接返回调用方。MCP 连接配置由用户在所用客户端添加，本项目不修改 Codex 配置。

## 开发与验证

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\browsers"
npx.cmd playwright install chromium
npx.cmd tsx scripts/browser-e2e.ts
```

浏览器脚本使用合成页面、隔离数据库与隔离 Vault，只验证扩展到文件的链路，**不代表真实 ChatGPT 五分钟验收**。真实验收步骤见 `docs/ACCEPTANCE.md`；测试报告见 `docs/RELEASE-REPORT.md`，可恢复进度见 `PROGRESS.md`。

官方实现参考：[Chrome 扩展跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[Node SQLite](https://nodejs.org/api/sqlite.html)、[OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat)。依赖版本以 package-lock.json 为准。
