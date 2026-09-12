# 项目任务：构建 GPT → Obsidian 自动学习记录系统

请直接开始开发，不要只给方案、架构建议或伪代码。

目标是在 Windows 上构建一个 **本地优先、低干扰、自动化的 ChatGPT 学习记录系统**：

> 浏览器插件负责观察我与 ChatGPT 的交互 → 本地服务统计有效学习时长并保存会话 → 自动总结本次学习内容、掌握情况、薄弱点和待办 → 写入 Obsidian → 与现有 Daily Note / Dataview / 热力图联动。

这不是一个新的学习 App。

**Obsidian 才是最终界面和数据中心。**

浏览器端尽量无界面，不允许制作占据 ChatGPT 页面空间的大型侧边栏。

---

# 一、强制路径要求

所有项目代码、数据库、缓存、构建产物都必须放在 D 盘。

项目根目录：

```text
D:\Projects\GPT-Obsidian-Tracker
```

禁止默认将数据库、日志、缓存、Node 项目数据放到 C 盘。

首先检查：

```text
D:\Obsidian\warehouse
```

如果该目录存在，则将其作为默认 Obsidian Vault。

在动任何 Obsidian 文件之前：

1. 检查 Vault 的现有目录结构。
2. 检查：

```text
D:\Obsidian\warehouse\.obsidian\plugins
```

3. 判断当前已经安装：

   * Dataview
   * Tasks
   * Heatmap Calendar
   * Tracker
   * Calendar
   * 其他与首页、学习记录、热力图有关的插件。
4. 搜索现有首页、Daily Note、学习记录和热力图相关 Markdown 文件。
5. 尽量兼容当前结构，而不是重新创建一套完全独立的体系。

不要删除、覆盖或大规模重构现有 Obsidian 文件。

所有自动修改必须可恢复。

---

# 二、最终架构

采用：

```text
Chrome / Edge Extension
        ↓
Local Collector
        ↓
SQLite
        ↓
Summary Engine
        ↓
Obsidian Writer
        ↓
Obsidian Vault

同时提供：

SQLite
   ↓
MCP Server
```

推荐 Monorepo：

```text
D:\Projects\GPT-Obsidian-Tracker
│
├─ apps
│  ├─ extension
│  ├─ collector
│  └─ mcp-server
│
├─ packages
│  ├─ shared
│  ├─ chatgpt-parser
│  ├─ activity-engine
│  ├─ obsidian-writer
│  └─ summary-engine
│
├─ scripts
│
├─ docs
│
├─ tests
│
├─ config
│
├─ PROGRESS.md
├─ README.md
└─ package.json
```

技术栈优先：

```text
TypeScript
Node.js
Chrome Manifest V3
SQLite
Zod
Vitest
```

可以使用 pnpm workspace。

---

# 三、产品原则

这个项目必须遵守：

```text
Local First
Obsidian First
Minimal UI
Non-destructive
Recoverable
Explainable
```

也就是说：

* 原始数据优先保存在本地。
* Obsidian 是主要查看入口。
* ChatGPT 页面尽量不出现 UI。
* 不破坏 Vault。
* 写错的数据可以撤销。
* 所有统计规则都应该可以解释。

---

# 四、浏览器插件

## 4.1 插件定位

插件只负责：

1. 判断当前是不是 ChatGPT 对话页面。
2. 判断当前对话 URL / conversation id。
3. 获取当前聊天标题。
4. 获取新增 User 消息。
5. 获取新增 Assistant 消息。
6. 判断 Assistant 是否正在生成。
7. 获取页面前台状态。
8. 获取浏览器窗口焦点。
9. 获取用户键盘、鼠标、滚动活动。
10. 将事件发送给 localhost Collector。

禁止：

* 在 ChatGPT 页面放大型面板。
* 改变 ChatGPT DOM。
* 干扰输入框。
* 自动发送 Prompt。
* 自动创建对话。
* 自动修改我的聊天内容。

---

# 五、插件 UI

第一版不要做复杂 UI。

默认 ChatGPT 页面上：

```text
什么都不显示
```

只使用浏览器扩展图标 Badge 表示状态：

```text
REC
PAUSE
OFF
```

点击扩展图标才出现一个非常小的 popup：

```text
GPT Learning Tracker

● 正在记录

当前会话：
高等数学极限

本次有效时间：
28m 17s

[暂停]
[忽略本次会话]
[立即同步 Obsidian]

Collector
● Connected
```

仅此即可。

不要设计 Dashboard。

Dashboard 在 Obsidian 里面。

---

# 六、ChatGPT DOM 解析

将 ChatGPT 页面解析器做成单独 package：

```text
packages/chatgpt-parser
```

不要把所有逻辑绑定到某一个 CSS class。

采用：

```text
MutationObserver
+
语义属性
+
data-* 属性
+
role
+
多级 selector fallback
```

解析结果统一转换成：

```ts
interface ChatMessage {
  id: string
  conversationId: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  sequence: number
}
```

同一条消息禁止重复记录。

需要测试：

* 刷新网页。
* 切换历史对话。
* 新开对话。
* Assistant 流式输出。
* 重新生成回答。
* 修改 User 消息。
* 同一对话继续追问。
* 页面 DOM 局部重新加载。

解析器失败时不能导致整个系统崩溃。

---

# 七、有效学习时间算法

这是项目最重要的模块之一。

不能把：

```text
ChatGPT 网页打开 2 小时
```

直接记录成：

```text
学习 2 小时
```

建立以下活动状态：

```ts
type ActivityState =
  | "typing"
  | "reading"
  | "generating"
  | "idle"
  | "background"
```

## typing

满足：

* ChatGPT tab 在前台。
* 浏览器窗口有焦点。
* 用户正在输入，或者最近发生键盘操作。

计入有效时间。

## reading

满足：

* tab 在前台。
* window focused。
* 最近有鼠标、滚动、键盘操作。

或者：

Assistant 刚完成输出后的合理阅读时间。

计入有效时间。

## generating

Assistant 正在输出并且：

* 当前 ChatGPT tab 位于前台。
* 浏览器窗口有焦点。

计入有效时间。

如果切换到其他程序，则不计。

## idle

满足例如：

```text
连续 180 秒无任何操作
```

停止累计。

## background

tab 不在前台或者浏览器没有 focus。

停止累计。

---

# 八、时间规则

初始默认：

```text
idleThreshold = 180 秒
readingGracePeriod = 120 秒
sessionSplitThreshold = 20 分钟
```

允许以后在 config 修改。

最终每个 Session 保存：

```text
wallClockSeconds
activeSeconds
typingSeconds
readingSeconds
generatingSeconds
idleSeconds
backgroundSeconds
```

核心指标：

```text
effectiveMinutes = activeSeconds / 60
```

Obsidian 默认展示 effectiveMinutes。

---

# 九、Session 划分

Session 至少包含：

```ts
interface StudySession {
  id: string
  conversationId: string
  conversationTitle: string

  startedAt: string
  endedAt: string

  effectiveSeconds: number

  source: "chatgpt"

  category?: string
  topics?: string[]

  status:
    | "recording"
    | "completed"
    | "ignored"
}
```

以下情况自动结束当前 Session：

1. 离开超过 20 分钟。
2. 切换到另一 ChatGPT conversation。
3. 浏览器关闭。
4. 用户点击“结束/同步”。
5. Collector 安全退出。

如果只是短暂切走：

```text
3 分钟查资料
```

不要分成两个 Session，只暂停计时。

---

# 十、SQLite

SQLite 数据库必须在 D 盘，例如：

```text
D:\Projects\GPT-Obsidian-Tracker\data\tracker.sqlite3
```

数据库至少包含：

```text
sessions
messages
activity_events
summaries
topics
session_topics
daily_stats
sync_records
settings
```

messages：

```text
id
session_id
conversation_id
role
content
created_at
sequence
hash
```

session：

```text
id
conversation_id
title
started_at
ended_at
wall_clock_seconds
active_seconds
typing_seconds
reading_seconds
generating_seconds
status
```

所有 schema 使用 migration 管理。

不要把 schema 创建语句散落在业务代码里。

---

# 十一、内容分类

系统自动判断本次 ChatGPT 对话属于什么。

默认类别：

```text
高等数学
算法
IELTS
计算机网络
Java
统计学
科研
论文写作
数学建模
项目开发
课程学习
生活
其他
```

允许多个 topic。

例如：

```text
category: 数学建模
topics:
- Q3
- 滚动调度
- 路径优化
```

分类结果允许在 Obsidian 中手动修改。

用户手动修改的数据优先级永远高于 AI 自动分类。

---

# 十二、总结引擎

为每一个完成 Session 生成结构化总结。

不要生成流水账。

需要输出 JSON：

```ts
interface SessionSummary {
  title: string

  category: string

  topics: string[]

  summary: string[]

  mastered: string[]

  weakPoints: string[]

  importantNotes: string[]

  nextActions: string[]

  artifacts: string[]
}
```

解释：

## summary

本次做了什么。

例如：

```text
学习多元函数偏导和雅可比。
完成 6 道练习。
```

## mastered

本次已经表现出理解的知识。

## weakPoints

出现错误、反复追问、表达不确定、明显没理解的内容。

例如：

```text
多变量链式法则仍容易混淆。
```

## importantNotes

值得长期保留的结论、技巧、注意事项。

## nextActions

下一次最合理的复习任务。

## artifacts

本次产生的成果：

```text
Word
PDF
代码
论文段落
练习结果
```

---

# 十三、总结模型

设计 Provider 抽象：

```ts
interface SummaryProvider {
  summarize(session): Promise<SessionSummary>
}
```

至少实现：

```text
none
openai-compatible
```

OpenAI-compatible 应允许配置：

```text
baseUrl
apiKey
model
```

因此以后可以接：

```text
OpenAI
DeepSeek
其他兼容接口
```

API Key 禁止写死进源码。

使用：

```text
.env.local
```

并加入 `.gitignore`。

如果未设置 API：

系统仍然正常记录时间和聊天。

Session 标记：

```text
summary_status: pending
```

不能因为总结 API 不存在而导致核心记录功能不可用。

---

# 十四、隐私原则

默认：

```text
所有聊天原文仅保存在本地 SQLite。
```

除非用户主动开启 AI 总结：

否则不得上传任何聊天文本。

设置：

```text
summary.enabled
summary.provider
summary.sendFullConversation
```

允许：

```text
sendFullConversation = false
```

只发送筛选后的必要文本。

---

# 十五、Obsidian 自动写入

所有生成内容最终进入：

```text
D:\Obsidian\warehouse
```

但首先检查现有 Vault 结构。

如果没有合适目录，再创建：

```text
学习记录/
  AI交互/
    会话/
    每日汇总/
    数据/
```

禁止在 Vault 根目录生成几十个散乱文件。

---

# 十六、单次会话 Markdown

例如：

```text
学习记录/AI交互/会话/2026-09-12-高等数学-雅可比.md
```

格式：

```markdown
---
type: ai-study-session
source: chatgpt
date: 2026-09-12
started: 20:03
ended: 21:05

effective_minutes: 36
wall_clock_minutes: 62

category: 高等数学

topics:
  - 偏导
  - 雅可比

mastery_score:

conversation_id:
conversation_url:

tracker_version: 0.1.0
---

# 高等数学：偏导与雅可比

## 本次学习

- 学习多元函数偏导的基本判断。
- 理解雅可比矩阵。
- 完成相关练习。

## 已掌握

- 能判断偏导时哪些变量作为常数。
- 理解雅可比由偏导数组成。

## 需要注意

- 多变量链式法则仍容易混淆。
- 雅可比矩阵与雅可比行列式需要继续区分。

## 重要结论

- xxx
- xxx

## 下一次

- [ ] 完成 3 道变量替换综合题
- [ ] 复习雅可比行列式

## 学习信息

| 项目 | 数据 |
|---|---|
| 有效学习 | 36 min |
| 总跨度 | 62 min |
| 开始 | 20:03 |
| 结束 | 21:05 |

## 原始对话

默认不把完整 ChatGPT 对话写入 Obsidian。

如需要查看：

`conversation_id: xxx`
```

注意：

**默认不要把整段聊天原文写入 Markdown。**

原文保留 SQLite。

Obsidian 只保存可回顾知识。

---

# 十七、每日汇总

每天生成或更新：

```text
学习记录/AI交互/每日汇总/YYYY-MM-DD.md
```

frontmatter：

```yaml
---
type: ai-learning-day
date: 2026-09-12

ai_minutes: 143
ai_sessions: 5

高等数学: 36
算法: 45
科研: 31
IELTS: 31

topics:
  - 雅可比
  - 前缀和
  - learner model
---
```

正文：

```markdown
# 2026-09-12 AI 学习

## 今日

有效学习：**2h 23m**

| 方向 | 时间 |
|---|---:|
| 算法 | 45m |
| 高等数学 | 36m |
| 科研 | 31m |
| IELTS | 31m |

## 今日完成

- [[高等数学：偏导与雅可比]]
- [[算法：前缀和]]
- [[科研：Learner Model]]

## 今日掌握

- xxx
- xxx

## 需要继续

- [ ] xxx
- [ ] xxx
```

---

# 十八、与现有 Daily Note 联动

检查当前 Vault 是否已有 Daily Note。

如果已有：

不要接管整个 Daily Note。

只允许维护如下机器区块：

```markdown
<!-- GPT_TRACKER_START -->

## 🤖 AI 学习

今日有效时间：143 min

- 高等数学：36 min
- 算法：45 min
- 科研：31 min
- IELTS：31 min

[[学习记录/AI交互/每日汇总/2026-09-12]]

<!-- GPT_TRACKER_END -->
```

每次更新只修改 START / END 中间内容。

不得改变该区块以外任何内容。

如果 Daily Note 没有该区块：

才允许追加到文件末尾。

---

# 十九、热力图联动

这是强制功能。

不要自己制作一个新的网页热力图。

首先检查现有 Obsidian：

```text
.obsidian/plugins
```

然后搜索 Vault 中已有：

```text
heatmap
calendar
Dataview
tracker
学习
时间
```

相关代码。

尽量复用现有热力图。

核心原则：

**让 GPT Tracker 输出的数据成为现有热力图的数据源。**

每天必须有统一字段：

```yaml
ai_minutes: 143
ai_sessions: 5
```

这样可以按：

```text
ai_minutes
```

生成每日颜色强度。

同时生成：

```text
学习记录/AI交互/数据/daily-stats.json
```

格式：

```json
{
  "2026-09-12": {
    "minutes": 143,
    "sessions": 5,
    "categories": {
      "高等数学": 36,
      "算法": 45,
      "科研": 31,
      "IELTS": 31
    }
  }
}
```

这样以后无论是：

```text
Dataview
Heatmap Calendar
Tracker
自定义 JS
```

都可以读取。

---

# 二十、Obsidian Dashboard

先检查用户现有首页。

如果已经存在学习 Dashboard：

优先增加数据源，不要重做首页。

如确实没有合适位置，再生成：

```text
学习记录/AI学习仪表盘.md
```

Dashboard 内容不要复杂。

重点只有：

```text
今天
本周
热力图
学习方向
最近记录
薄弱点
```

禁止做大量卡片。

优先使用：

```text
Markdown
Dataview
表格
简单图表
```

视觉应该克制、简洁。

---

# 二十一、Dataview 数据兼容

所有学习 Session 必须可以通过：

```dataview
TABLE
effective_minutes,
category,
topics
FROM "学习记录/AI交互/会话"
SORT date DESC
```

直接查询。

每日数据：

```dataview
TABLE
ai_minutes,
ai_sessions
FROM "学习记录/AI交互/每日汇总"
SORT date DESC
```

确保 frontmatter 数据类型正确。

---

# 二十二、MCP Server

核心 Tracker 完成后，实现一个 MCP Server。

目录：

```text
apps/mcp-server
```

第一版提供只读工具：

```text
tracker_today
tracker_day
tracker_week
tracker_sessions
tracker_search
tracker_topics
tracker_weak_points
tracker_stats
```

例如：

```text
tracker_today
```

返回：

```json
{
  "effectiveMinutes": 143,
  "sessions": 5,
  "categories": {},
  "weakPoints": [],
  "nextActions": []
}
```

这样以后 AI 可以直接回答：

```text
我这周高数学了多久？
```

或者：

```text
我最近算法最薄弱的是什么？
```

---

# 二十三、暂时不要实现的东西

v0.1 不需要：

```text
Embedding
向量数据库
知识图谱
复杂 RAG
复杂 Agent
云同步
账号系统
多人系统
网页 Dashboard
手机 App
```

保持项目足够轻。

---

# 二十四、异常保护

必须考虑：

### Collector 没启动

Extension 显示：

```text
OFF
```

不能疯狂重连。

### ChatGPT 页面结构变化

Parser 报：

```text
PARSER_DEGRADED
```

不得写入错误消息。

### Obsidian 正在编辑文件

写入使用：

```text
temp file
→ atomic rename
```

尽量防止文件损坏。

### Markdown 已存在

使用稳定 Session ID，避免重复创建。

### 系统崩溃

重新启动后：

从 SQLite 恢复未结束 Session。

---

# 二十五、日志

日志：

```text
D:\Projects\GPT-Obsidian-Tracker\logs
```

分：

```text
collector.log
extension.log
obsidian.log
summary.log
```

设置日志轮转。

禁止日志无限增长。

---

# 二十六、项目配置

提供：

```text
config/default.json
```

示例：

```json
{
  "vaultPath": "D:\\Obsidian\\warehouse",

  "idleThresholdSeconds": 180,

  "readingGraceSeconds": 120,

  "sessionSplitMinutes": 20,

  "obsidian": {
    "sessionFolder": "学习记录/AI交互/会话",
    "dailyFolder": "学习记录/AI交互/每日汇总"
  },

  "summary": {
    "enabled": false,
    "provider": "none"
  }
}
```

---

# 二十七、Windows 启动方式

提供：

```text
scripts\dev.bat
scripts\start.bat
scripts\build.bat
scripts\test.bat
```

最终我要可以：

双击：

```text
start.bat
```

就启动 Collector。

浏览器插件加载：

```text
D:\Projects\GPT-Obsidian-Tracker\apps\extension\dist
```

---

# 二十八、不要自动设置开机启动

第一版不要未经允许：

```text
注册 Windows Service
修改注册表
添加启动项
创建计划任务
```

但可以在 README 中说明以后如何开启。

---

# 二十九、测试

至少测试：

## Activity

* 前台持续使用。
* 后台切出。
* 长时间 idle。
* Assistant generating。
* 阅读停顿。
* 返回继续。

## Parser

* User message。
* Assistant message。
* 流式输出。
* regenerate。
* 页面刷新。
* 对话切换。

## Obsidian

* 创建 Session。
* 更新 Daily Summary。
* 修改 Daily Note machine block。
* 重复同步。
* 崩溃恢复。
* Unicode / 中文。
* 文件名非法字符。

## SQLite

* migration。
* duplicate message。
* unfinished session recovery。

---

# 三十、验收场景

最终必须实际完成一次完整测试：

### Step 1

打开 ChatGPT。

### Step 2

进行约 5 分钟测试对话。

### Step 3

确认 SQLite 生成 Session。

### Step 4

切到其他浏览器 Tab。

确认时间停止。

### Step 5

回到 ChatGPT。

确认继续累计。

### Step 6

结束 Session。

### Step 7

确认：

```text
D:\Obsidian\warehouse
```

出现对应 Markdown。

### Step 8

确认每日统计：

```text
ai_minutes
```

正确更新。

### Step 9

确认现有热力图或者测试热力图能够使用该字段。

### Step 10

关闭 Collector → 重启。

确认数据仍然存在。

---

# 三十一、Git

如果目录还不是 Git Repo：

```bash
git init
```

建立：

```text
main
```

开发过程中合理 commit。

不要一个 commit 塞完整个项目。

`.gitignore` 必须包含：

```text
node_modules
dist
.env*
data/*.sqlite*
logs
```

---

# 三十二、进度保护

这是强制要求。

维护：

```text
PROGRESS.md
```

每完成一部分立即更新。

格式：

```markdown
# GPT Obsidian Tracker Progress

## 当前状态

BUILDING

## 已完成

- [x] Monorepo
- [x] SQLite
- [ ] Extension parser
- [ ] Activity tracker
- [ ] Obsidian writer

## 当前正在做

ChatGPT DOM Parser

## 下一步

Activity Engine

## 当前问题

无

## 最近测试

npm test

xx / xx passed

## 最近 Commit

xxxxxxx
```

这样即使电脑重启，也可以继续。

---

# 三十三、README

README 必须让我不看源码也知道：

1. 项目是做什么的。
2. 怎么安装依赖。
3. 怎么启动 Collector。
4. 怎么加载 Chrome Extension。
5. 怎么设置 Vault。
6. 怎么开启 AI Summary。
7. 数据保存在哪里。
8. 怎么关闭记录。
9. 怎么删除某一次 Session。
10. 怎么完全卸载。

---

# 三十四、开发顺序

严格按照这个顺序：

```text
1. 检查 D:\Obsidian\warehouse

2. 检查现有热力图和 Dataview 结构

3. 创建项目

4. shared types

5. SQLite

6. Collector API

7. Chrome Extension

8. ChatGPT Parser

9. Activity Engine

10. Session Engine

11. Obsidian Writer

12. Daily Summary

13. Heatmap integration

14. Summary Provider

15. MCP

16. Tests

17. Windows scripts

18. Release 验收
```

不要先浪费时间做 UI。

---

# 三十五、代码质量

要求：

```text
TypeScript strict
ESLint
Prettier
Vitest
明确模块边界
无 any 滥用
错误处理
结构化日志
```

核心模块必须有测试。

避免超大文件。

单个模块职责清晰。

---

# 三十六、最终交付

完成后不要只告诉我：

```text
“已经完成”
```

必须给出：

## 1. 项目位置

```text
D:\Projects\GPT-Obsidian-Tracker
```

## 2. 最终目录树

## 3. Git commit

## 4. 自动化测试结果

例如：

```text
Vitest 58/58
Lint passed
Build passed
```

## 5. 浏览器插件位置

## 6. Collector 启动方式

## 7. SQLite 路径

## 8. Obsidian 实际生成了哪些文件

## 9. Heatmap 如何读取数据

## 10. 尚未完成的问题

## 11. 一次实际端到端测试结果

---

# 最终产品体验

我不希望得到一个新的复杂软件。

理想状态：

```text
打开电脑
↓
启动 Collector
↓
正常使用 ChatGPT
↓
什么都不用操作
↓
学习结束
↓
打开 Obsidian
↓
今天的学习时间、主题、掌握内容、
薄弱点、下一步已经自动出现
↓
热力图自动增加今天的颜色
```

这才是本项目的核心。

优先把这一条完整链路做稳定，再考虑任何附加功能。

现在直接开始检查 D 盘与 Obsidian Vault 并实施开发。
