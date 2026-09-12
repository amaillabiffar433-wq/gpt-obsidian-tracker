import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PROJECT_ROOT,loadConfig } from './config';
import { Store } from './database';
import { Logger } from './logger';
import { TrackerService } from './service';
import { createApi } from './server';
const config=loadConfig(),logger=new Logger(PROJECT_ROOT);
const tokenPath=path.join(PROJECT_ROOT,'data/collector-token');
if(!fs.existsSync(tokenPath))fs.writeFileSync(tokenPath,randomBytes(32).toString('hex'),{flag:'wx'});
const token=fs.readFileSync(tokenPath,'utf8').trim();
const store=new Store(path.join(PROJECT_ROOT,'data/tracker.sqlite3'),path.join(PROJECT_ROOT,'apps/collector/migrations'));
const service=new TrackerService(store,config,PROJECT_ROOT,logger);
const server=createApi(service,token,logger);
server.requestTimeout=10000;server.headersTimeout=10000;
let timer:NodeJS.Timeout|undefined,closing=false;
server.on('error',error=>{logger.log('collector','SERVER_ERROR',{message:error.message});console.error('Collector 启动失败：端口可能已被占用。');store.close();process.exitCode=1;});
server.listen(config.port,'127.0.0.1',()=>{
 service.engine.recover(Date.now());logger.log('collector','STARTED',{port:config.port});console.log(`GPT Learning Tracker · http://127.0.0.1:${config.port}\nVault: ${config.vaultPath}\nCtrl+C 安全退出。`);
 let ticks=0;timer=setInterval(()=>{try{service.engine.tick(Date.now());if(++ticks%6===0)void service.sync().catch(()=>{});}catch{logger.log('collector','TICK_FAILED');}},5000);
 void service.sync().catch(()=>{});
});
async function shutdown() {if(closing)return;closing=true;if(timer)clearInterval(timer);server.close();server.closeIdleConnections();await service.shutdown();store.close();logger.log('collector','STOPPED');}
process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
