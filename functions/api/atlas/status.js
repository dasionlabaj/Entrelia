// Atlas observability / status: public and deliberately coarse.
import { onRequestGet as health } from "../health.js";
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet(ctx){
 const result=await health(ctx),data=await result.json();
 const checks=data.checks||{};
 const archive=checks.archive||{state:"unknown"};
 const age=archive.latestMatchAt?Math.max(0,Date.now()-Date.parse(archive.latestMatchAt)):null;
 const ingestion={state:archive.state!=="ok"?"unknown":age===null?"no_data":age>86400000?"stale":"recent",latestMatchAt:archive.latestMatchAt||null};
 const services={pages:{state:"reachable"},riot:{state:checks.riot?.state||"unknown"},d1:{state:archive.state},matches:ingestion,rank:{state:"not_checked"}};
 const healthy=services.riot.state==="ok"&&services.d1.state==="ok";
 return json({status:healthy?"ok":"degraded",checkedAt:data.checkedAt,services,note:"Disponibilita Riot non equivale a sincronizzazione riuscita. La presenza di partite recenti non e garanzia di ingestione automatica."},healthy?200:207);
}
