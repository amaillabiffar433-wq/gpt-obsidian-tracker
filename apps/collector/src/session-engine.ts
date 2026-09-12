import { randomUUID } from 'node:crypto';
import { zeroCounters, type ActivitySample, type Config, type StudySession } from '../../../packages/shared/src/index';
import { activityState, integrate } from '../../../packages/activity-engine/src/index';
import { Store } from './database';

export class SessionEngine {
 constructor(readonly store: Store, readonly config: Config) {}
 current(clientId: string) { return this.store.sessions().find(s => s.status==='recording' && s.clientId===clientId); }
 advance(s: StudySession, at: number) {
  if (at<=s.endedAt || s.status!=='recording') return;
  const candidate=integrate(s.lastSample,s.endedAt,at,this.config);
  let finishAt=at;
  for (const seg of candidate.segments) {
   if (['typing','reading','generating'].includes(seg.state)) s.lastActiveAt=seg.end;
   else if (seg.end>=s.lastActiveAt+this.config.sessionSplitMinutes*60000) { finishAt=Math.max(s.endedAt,s.lastActiveAt+this.config.sessionSplitMinutes*60000); s.status='completed'; break; }
  }
  const {counters,segments}=integrate(s.lastSample,s.endedAt,finishAt,this.config);
  for (const key of Object.keys(counters) as (keyof typeof counters)[]) s[key]+=counters[key];
  for (const seg of segments) this.store.db.prepare('INSERT OR IGNORE INTO activity_segments VALUES(?,?,?,?)').run(s.id,seg.start,seg.end,seg.state);
  s.endedAt=finishAt;
  this.store.save(s);
 }
 recover(now: number) {
  this.store.transaction(()=> { for (const s of this.store.sessions().filter(x=>x.status==='recording')) {
   // No positive evidence of focus while the collector was down. Never credit it.
   s.lastSample={...s.lastSample,visible:false,focused:false,at:s.endedAt}; this.advance(s,now);
  }});
 }
 tick(now: number) { this.store.transaction(()=> { for (const s of this.store.sessions().filter(x=>x.status==='recording')) this.advance(s,now); }); }
 ingest(sample: ActivitySample): StudySession | undefined {
  return this.store.transaction(()=> {
   if (this.store.db.prepare('SELECT 1 FROM activity_events WHERE id=?').get(sample.eventId)) return this.current(sample.clientId);
   let current=this.current(sample.clientId);
   if (current && sample.at<current.endedAt) return current;
   if (current && current.conversationId.startsWith('new-') && !sample.conversationId.startsWith('new-')) {
    const old=current.conversationId; current.conversationId=sample.conversationId;
    this.store.db.prepare('UPDATE messages SET conversation_id=? WHERE conversation_id=?').run(sample.conversationId,old);
   }
   if (current) {
    this.advance(current,sample.at);
    if (current.conversationId!==sample.conversationId) { current.status='completed'; this.store.save(current); current=undefined; }
    else if (current.status!=='recording') current=undefined;
   }
   const ignored = this.store.setting<string|null>('ignored:'+sample.clientId,null);
   if (ignored && ignored!==sample.conversationId) this.store.setSetting('ignored:'+sample.clientId,null);
   if (this.store.setting('paused',false) || ignored===sample.conversationId) return undefined;
   // Only the truly focused foreground client can accrue active time.
   if (sample.visible && sample.focused) for (const other of this.store.sessions().filter(x=>x.status==='recording'&&x.clientId!==sample.clientId)) {
    this.advance(other,sample.at); other.lastSample={...other.lastSample,visible:false,focused:false,at:sample.at}; this.store.save(other);
   }
   if (!current) {
    const rearm=this.store.setting<{conversationId:string;at:number}|null>('rearm:'+sample.clientId,null);
    if(rearm&&rearm.conversationId===sample.conversationId&&sample.lastInteraction<=rearm.at)return undefined;
    if (sample.kind!=='sample' || !sample.visible || !sample.focused || sample.parserStatus!=='OK') return undefined;
    if (!['typing','reading','generating'].includes(activityState(sample,sample.at,this.config))) return undefined;
    current={...zeroCounters(),id:randomUUID(),clientId:sample.clientId,conversationId:sample.conversationId,conversationTitle:sample.title,conversationUrl:sample.url,startedAt:sample.at,endedAt:sample.at,lastSample:sample,lastActiveAt:sample.at,status:'recording',category:'其他',topics:[],summaryStatus:'pending',source:'chatgpt',effectiveSeconds:0,notePath:null,isTest:false};
   }
   current.lastSample={...sample,messages:[]}; current.conversationTitle=sample.title; current.conversationUrl=sample.url;
   if (sample.kind==='close') current.status='completed';
   this.store.save(current);
   // Persist observations but never duplicate raw message text in the event log.
   this.store.db.prepare('INSERT INTO activity_events VALUES(?,?,?,?)').run(sample.eventId,current.id,sample.at,JSON.stringify({...sample,messages:sample.messages.map(m=>({id:m.id}))}));
   if (sample.parserStatus==='OK') for (const m of sample.messages) { if(m.conversationId===sample.conversationId) this.store.upsertMessage(current.id,m,sample.at); }
   return current;
  });
 }
 finish(clientId: string, now: number, ignored=false) { this.store.transaction(()=> {
  const s=this.current(clientId); if (!s) return;
  this.advance(s,now); s.status=ignored?'ignored':'completed'; this.store.save(s);
  this.store.setSetting('rearm:'+clientId,{conversationId:s.conversationId,at:now});
  if(ignored) this.store.setSetting('ignored:'+clientId,s.conversationId);
 }); }
 pause(now: number) { this.store.transaction(()=> {
  for(const s of this.store.sessions().filter(x=>x.status==='recording')) { this.advance(s,now);s.lastSample={...s.lastSample,focused:false,visible:false,at:now};this.store.save(s); }
  this.store.setSetting('paused',true);
 }); }
}
