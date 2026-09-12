import fs from 'node:fs';
import path from 'node:path';
import {loadConfig,PROJECT_ROOT} from '../apps/collector/src/config';
import {Store} from '../apps/collector/src/database';
import {SafeFiles,machineBlock} from '../packages/obsidian-writer/src/safe-files';
const c=loadConfig(),store=new Store(path.join(PROJECT_ROOT,'data/tracker.sqlite3'),path.join(PROJECT_ROOT,'apps/collector/migrations'));
const files=new SafeFiles(c.vaultPath,PROJECT_ROOT,store);
const daily=c.obsidian.dailyFolder.replace(/"/g,'');
const changes:string[]=[];
function update(file:string,transform:(old:string)=>string){const old=files.read(file);if(old===null)throw new Error('INTEGRATION_TARGET_MISSING: '+file);if(files.write(file,transform(old),old))changes.push(file);}
update('首页/学习热力图.md',old=>{
 if(old.includes('// GPT_TRACKER_HEATMAP_SOURCE'))return old;
 const needle='const today=new Date();';if(!old.includes(needle))throw new Error('HEATMAP_LAYOUT_CHANGED');
 return old.replace(needle,`// GPT_TRACKER_HEATMAP_SOURCE\nfor (const p of dv.pages('"${daily}"')) {\n  const d = String(p.date ?? '').match(/\\d{4}-\\d{2}-\\d{2}/)?.[0];\n  if (!d) continue;\n  const previous = byDate.get(d);\n  byDate.set(d, {total: (previous?.total ?? 0) + (Number(p.ai_minutes) || 0), path: previous?.path ?? p.file.path});\n}\n${needle}`);
});
update('Obsidian配置/Dashboard/组件/60_学习热力图.md',old=>{
 if(old.includes('// GPT_TRACKER_HEATMAP_SOURCE'))return old;
 const needle='>   const today = new Date();';if(!old.includes(needle))throw new Error('HEATMAP_LAYOUT_CHANGED');
 return old.replace(needle,`>   // GPT_TRACKER_HEATMAP_SOURCE\n>   for (const page of Array.from(dv.pages('"${daily}"'))) {\n>     const key = readDate(page); if (!key) continue;\n>     const old = minutesByDay.get(key);\n>     minutesByDay.set(key, {minutes: (old?.minutes ?? 0) + (Number(page.ai_minutes) || 0), mtime: old?.mtime ?? 0});\n>   }\n${needle}`);
});
const query=`## GPT 自动学习记录\n\n自动计时与原手工字段分别保存；上方热力图已按日期合并两种来源。请勿把同一时段再手填到学习分钟中。\n\n\`\`\`dataviewjs\nconst days = dv.pages('"${daily}"');\nconst today = dv.date('today');\nconst week = today.startOf('week');\nconst sum = rows => Array.from(rows).reduce((n,p)=>n+(Number(p.ai_minutes)||0),0);\ndv.table(['今天 GPT 分钟','本周 GPT 分钟'],[[sum(days.where(p=>String(p.date).slice(0,10)===today.toISODate())).toFixed(2),sum(days.where(p=>p.date>=week && p.date<=today)).toFixed(2)]]);\nconst groups = new Map();\nfor (const p of days) for (const [category,minutes] of Object.entries(p.categories ?? {})) groups.set(category,(groups.get(category)??0)+Number(minutes||0));\ndv.table(['学习方向','累计分钟'],[...groups.entries()].map(([k,v])=>[k,v.toFixed(2)]));\n\`\`\`\n\n### 最近记录\n\n\`\`\`dataview\nTABLE effective_minutes AS 有效分钟, category AS 方向, topics AS 主题, summary_status AS 总结\nFROM "${c.obsidian.sessionFolder}"\nWHERE status != "ignored"\nSORT date DESC\nLIMIT 8\n\`\`\`\n\n### 薄弱点\n\n\`\`\`dataview\nTABLE category AS 方向, weak_points AS 需要复习\nFROM "${c.obsidian.sessionFolder}"\nWHERE status != "ignored" AND length(weak_points) > 0\nSORT date DESC\nLIMIT 8\n\`\`\`\n\n数据：[[${c.obsidian.dataFolder}/使用说明]]`;
update('首页/启动首页.md',old=>machineBlock(old,query));
const guide=`# GPT 自动学习记录\n\n本系统从浏览器交互证据估算有效时间；不是屏幕打开时长。\n\n- 会话：${c.obsidian.sessionFolder}\n- 每日汇总：${c.obsidian.dailyFolder}\n- 机器可读数据：daily-stats.json\n- 每日数值字段：ai_minutes、ai_sessions；分类统计在 categories。\n- 原始对话仅保留本地 SQLite。默认总结 pending，不推断已掌握知识。\n- category、topics 可在会话 YAML 中手改，后续同步会保留并更新统计。\n- 手改生成正文后，后续同步保留正文；新增总结仍保存在 SQLite，避免覆盖人工笔记。\n- Daily Note 只维护 GPT_TRACKER 区块；已有手工分钟字段不会改变。\n- 现有两处热力图按日期相加：原 Daily Note 手工分钟 + 自动每日汇总 ai_minutes。相同时段不应再手工重复填报。\n- 返回 [[首页/启动首页]] / [[首页/学习热力图]]。\n`;
const guidePath=c.obsidian.dataFolder+'/使用说明.md',guideOld=files.read(guidePath);
if(guideOld===null) {files.write(guidePath,guide,null);changes.push(guidePath);}
const statsPath=c.obsidian.dataFolder+'/daily-stats.json';if(files.read(statsPath)===null){files.write(statsPath,'{}\n',null);changes.push(statsPath);}
fs.mkdirSync(path.join(PROJECT_ROOT,'work'),{recursive:true});
fs.writeFileSync(path.join(PROJECT_ROOT,'work/integration-result.json'),JSON.stringify({at:new Date().toISOString(),changes,records:store.db.prepare('SELECT * FROM sync_records ORDER BY created_at').all()},null,2));
console.log(JSON.stringify({changes},null,2));store.close();
