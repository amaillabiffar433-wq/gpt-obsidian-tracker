import { dateKey, type DailyStats } from '../../shared/src/index';
import type { Store } from '../../../apps/collector/src/database';
const empty=():DailyStats=>({minutes:0,sessions:0,categories:{},topics:[],sessionIds:[],weakPoints:[],nextActions:[],mastered:[]});
export function aggregate(store: Store, timezone: string, includeRecording=false): Record<string,DailyStats> {
 const days:Record<string,DailyStats>={};
 const sessions=new Map(store.sessions().filter(s=>!s.isTest&&s.status!=='ignored'&&(includeRecording||s.status==='completed')).map(s=>[s.id,s]));
 const segments=store.db.prepare("SELECT * FROM activity_segments WHERE state IN ('typing','reading','generating') ORDER BY start_at").all();
 for(const row of segments) {
  const s=sessions.get(String(row.session_id));if(!s)continue;
  let start=Number(row.start_at);const end=Number(row.end_at);
  while(start<end) {
   const day=dateKey(start,timezone);let stop=end;
   if(dateKey(end-1,timezone)!==day) { let lo=start,hi=end;while(hi-lo>1){const mid=Math.floor((hi+lo)/2);if(dateKey(mid,timezone)===day)lo=mid;else hi=mid;}stop=hi; }
   const stats=days[day]??=empty();const minutes=(stop-start)/60000;
   stats.minutes+=minutes;stats.categories[s.category]=(stats.categories[s.category]??0)+minutes;
   if(!stats.sessionIds.includes(s.id)) {
    stats.sessionIds.push(s.id);stats.sessions++;stats.topics.push(...s.topics);
    const summary=store.summary(s.id);if(summary){stats.weakPoints.push(...summary.weakPoints);stats.nextActions.push(...summary.nextActions);stats.mastered.push(...summary.mastered);}
   }
   start=stop;
  }
 }
 for(const stats of Object.values(days)) { stats.minutes=Math.round(stats.minutes*10000)/10000;for(const key of Object.keys(stats.categories))stats.categories[key]=Math.round(stats.categories[key]*10000)/10000;for(const key of ['topics','weakPoints','nextActions','mastered'] as const)stats[key]=[...new Set(stats[key])]; }
 return days;
}
