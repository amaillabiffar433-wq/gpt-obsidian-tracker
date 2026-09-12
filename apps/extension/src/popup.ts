const el = (id: string) => document.getElementById(id)!;
let paused = false;
async function update() {
 try {
  const s = await chrome.runtime.sendMessage({ type: 'status' }) as { connected?: boolean; paused?: boolean; ignored?: boolean; recording?: boolean; title?: string; effectiveSeconds?: number; parserStatus?: string; syncError?: string };
  paused = !!s.paused;
  el('state').textContent = !s.connected ? '● OFF' : s.ignored ? '● 已忽略' : paused ? '● PAUSE' : s.recording ? '● 正在记录' : '● 等待 ChatGPT 对话';
  el('title').textContent = s.title || '—';
  const seconds = Math.floor(s.effectiveSeconds ?? 0);
  el('time').textContent = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  el('pause').textContent = paused ? '继续记录' : '暂停';
  el('connection').textContent = 'Collector · ' + (s.connected ? 'Connected' : 'Disconnected');
  el('error').textContent = s.parserStatus === 'PARSER_DEGRADED' ? 'PARSER_DEGRADED：页面解析暂不可用' : s.syncError ? 'Obsidian 同步待重试，请查看本地日志。' : '';
 } catch { el('connection').textContent = 'Collector · Disconnected'; }
}
for (const name of ['pause', 'ignore', 'finish']) el(name).addEventListener('click', () => { void (async () => { const response = await chrome.runtime.sendMessage({ type: 'control', action: name === 'pause' && paused ? 'resume' : name }) as { error?: string }; if (response.error) el('error').textContent = '操作失败，请先启动 Collector。'; await update(); })(); });
void update(); setInterval(() => { void update(); }, 1000);
