# 验收记录与真人步骤

自动化测试数据只进入 work 下的隔离 Vault，不能混入用户真实学习分钟。

## 真人 ChatGPT 验收（尚待实际完成）

1. 启动 Collector，加载 apps/extension/dist；刷新 ChatGPT。
2. 正常进行约 5 分钟真实学习对话。扩展不会替用户发 Prompt。
3. 图标 popup 应显示 REC 与有效时间。若显示 PARSER_DEGRADED，保存页面结构证据并调整语义 selector，不能声称捕获成功。
4. 切到其他标签页约 20 秒；返回 popup 检查时间在后台段停止。
5. 返回 ChatGPT 继续交互，确认累计恢复。
6. 点击“结束并同步 Obsidian”。
7. 核验 SQLite sessions、messages 与 activity_segments，确认生成会话 Markdown。
8. 核验每日汇总 ai_minutes 与 daily-stats.json；Daily Note 区块以外保持原样。
9. 在原有 Obsidian 热力图中查看当天数据；默认无总结 API 时 pending 是预期状态。
10. 关闭 Collector 并重启，确认 Session 和秒数保持。

不得用脚本发送的合成事件、合成页面或压缩时钟测试替代这份真人验收。

## 测试边界

- ChatGPT 私有 DOM 没有稳定公开契约；当前解析器支持语义 author role、message id、turn 标签与标题 fallback。未知结构降级为空消息。
- 浏览器异常关闭可能没有最终事件；心跳超时后停止计时，20 分钟后完成会话。正常标签关闭优先使用 tabs.onRemoved。
- 文件写入采用备份、fsync、同目录原子替换、写前内容比对；跨进程编辑仍可能在极短检查/rename 窗口发生竞争，已有备份可恢复，不能宣称系统级跨应用锁。
- 本版本不自动调整 Obsidian 插件，不自动设置开机启动。
