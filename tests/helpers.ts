import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {type Config,type ActivitySample} from '../packages/shared/src/index';
import {Store} from '../apps/collector/src/database';
import {SessionEngine} from '../apps/collector/src/session-engine';
const root='D:/Projects/GPT-Obsidian-Tracker';
export const T=Date.parse('2026-09-12T10:00:00Z');
export function sample(at=T,extra:Partial<ActivitySample>={}):ActivitySample {return{eventId:randomUUID(),clientId:'test-client',conversationId:'test-conversation',title:'高等数学：雅可比',url:'https://chatgpt.com/c/test-conversation',at,visible:true,focused:true,generating:false,lastInteraction:T,lastKeyboard:0,lastAssistantFinished:0,parserStatus:'OK',messages:[],kind:'sample',...extra};}
export function setup() {
 const dir=path.join(root,'work','tests',randomUUID());fs.mkdirSync(path.join(dir,'vault/.obsidian'),{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(root,'config/default.json'),'utf8')) as Config;config.vaultPath=path.join(dir,'vault');
 const store=new Store(path.join(dir,'data/test.sqlite3'),path.join(root,'apps/collector/migrations'));
 const engine=new SessionEngine(store,config);
 return{dir,config,store,engine,close:()=>store.close()};
}
