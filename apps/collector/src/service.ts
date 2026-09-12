import { type Config,type ActivitySample } from '../../../packages/shared/src/index';
import { ObsidianWriter } from '../../../packages/obsidian-writer/src/index';
import { provider,classify,type SummaryProvider } from '../../../packages/summary-engine/src/index';
import { Store } from './database';
import { Logger } from './logger';
import { SessionEngine } from './session-engine';

export class TrackerService {
 readonly engine:SessionEngine; readonly writer:ObsidianWriter; readonly summaryProvider:SummaryProvider;
 private pending:Promise<unknown>|null=null;
 syncError='';
 constructor(readonly store:Store,readonly config:Config,root:string,readonly logger:Logger) {this.engine=new SessionEngine(store,config);this.writer=new ObsidianWriter(store,config,root);this.summaryProvider=provider(config.summary);}
 ingest(s:ActivitySample,now=Date.now()) {
  if(s.at>now+5000||s.at<now-60000)throw new Error('STALE_EVENT');
  for(const key of ['lastInteraction','lastKeyboard','lastAssistantFinished'] as const)if(s[key]>s.at+1000)throw new Error('INVALID_ACTIVITY_TIME');
  if(!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(s.url))throw new Error('INVALID_CONVERSATION_URL');
  this.engine.ingest(s);
  if(s.parserStatus==='PARSER_DEGRADED')this.logger.log('extension','PARSER_DEGRADED',{clientId:s.clientId});
  return this.status(s.clientId);
 }
 status(clientId:string) {
  const s=this.engine.current(clientId);
  return {connected:true,paused:this.store.setting('paused',false),ignored:!!this.store.setting('ignored:'+clientId,null),recording:!!s,title:s?.conversationTitle??'',effectiveSeconds:s?.activeSeconds??0,sessionId:s?.id,parserStatus:s?.lastSample.parserStatus??'OK',syncError:this.syncError};
 }
 async control(action:'pause'|'resume'|'ignore'|'finish'|'sync',clientId:string,now=Date.now()) {
  if(action==='pause')this.engine.pause(now);
  if(action==='resume')this.store.setSetting('paused',false);
  if(action==='ignore'||action==='finish')this.engine.finish(clientId,now,action==='ignore');
  if(['ignore','finish','sync'].includes(action))await this.sync();
  return this.status(clientId);
 }
 sync():Promise<unknown> {
  if(this.pending)return this.pending;
  this.pending=this.runSync().finally(()=>{this.pending=null;});return this.pending;
 }
 private async runSync() {
  try {
   for(let s of this.store.sessions().filter(x=>x.status==='completed'&&!x.isTest)) {
    this.writer.importOverrides(s);
    const local=classify(s.conversationTitle,this.store.messages(s.id));
    if(!this.store.setting('manual-category:'+s.id,false)&&s.summaryStatus!=='completed')s.category=local.category;
    if(!this.store.setting('manual-topics:'+s.id,false)&&s.summaryStatus!=='completed')s.topics=local.topics;
    this.store.save(s);
    const retryAt=this.store.setting('summary-retry:'+s.id,0);
    if(s.summaryStatus!=='completed'&&Date.now()>=retryAt) {
     try {
      const result=await this.summaryProvider.summarize({session:s,messages:this.store.messages(s.id)});
      if(result) {
       s=this.store.session(s.id)!;if(s.status!=='completed')continue;
       this.writer.importOverrides(s);
       if(!this.store.setting('manual-category:'+s.id,false))s.category=result.category;
       if(!this.store.setting('manual-topics:'+s.id,false))s.topics=result.topics;
       s.summaryStatus='completed';this.store.saveSummary(s.id,result,this.config.summary.provider);this.store.save(s);
      }
     } catch {s=this.store.session(s.id)!;s.summaryStatus='failed';this.store.save(s);this.store.setSetting('summary-retry:'+s.id,Date.now()+15*60000);this.logger.log('summary','SUMMARY_FAILED',{sessionId:s.id});}
    }
   }
   const result=this.writer.sync();this.syncError='';this.logger.log('obsidian','SYNC_OK',result);return result;
  } catch(error) {this.syncError=error instanceof Error?error.message:'SYNC_FAILED';this.logger.log('obsidian',this.syncError);throw error;}
 }
 async shutdown() { for(const s of this.store.sessions().filter(x=>x.status==='recording'))this.engine.finish(s.clientId,Date.now());await this.sync().catch(()=>{}); }
}
