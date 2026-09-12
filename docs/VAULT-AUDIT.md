# Vault 审计（2026-09-12）

- Vault: D:\Obsidian\warehouse，已存在。
- 已安装且启用：dataview（DataviewJS 开启）、obsidian-tasks-plugin、obsidian-tracker、calendar、periodic-notes、homepage。未安装 Heatmap Calendar；不添加重复插件。
- 现有页面：首页/启动首页.md、首页/学习热力图.md；组件 Obsidian配置/Dashboard/组件/60_学习热力图.md。
- Daily Note：periodic-notes daily.format = YYYY-MM-DD dddd，folder = 日常记录，中文星期后缀。
- 现有统计读取日常记录中的 ai_minutes / algorithm_minutes / english_minutes / other_study_minutes。
- Daily Note 仅修改 GPT_TRACKER 标记区块；不覆盖现有 ai_minutes。自动数据在独立每日汇总，现有热力图额外按日期合并该源，避免改用户历史数据。
- 新增记录集中在 学习记录/AI交互；现有首页只追加机器管理的查询区块。热力图原代码增加第二数据源，原始文件先备份并核验 SHA-256。
- 无项目目录，无适用 AGENTS.md；已建立 main 分支。所有项目代码、SQLite、日志、依赖、测试临时目录与备份位于 D 盘。
- 默认不调用外部总结 API，不导出聊天全文到 Vault，不向真实学习统计注入自动化测试数据。
