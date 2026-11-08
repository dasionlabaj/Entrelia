// Public, read-only archive summary for daxs#EUW.
// Dates are Europe/Rome; archived matches are distinct by Riot match ID.
const START="2026-11-08";
const TZ="Europe/Rome";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=60":"no-store","x-content-type-options":"nosniff"}});
function dayRome(d){return new Intl.DateTimeFormat("sv-SE",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
function midnightRomeUtc(key){
  const [y,m,d]=key.split("-").map(Number);
  const utc=Date.UTC(y,m-1,d);
  const tz=new Intl.DateTimeFormat("en-US",{timeZone:TZ,timeZoneName:"shortOffset"}).formatToParts(new Date(utc)).find(p=>p.type==="timeZoneName")?.value||"GMT";
  const hit=tz.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offset=hit?(hit[1]==="-"?-1:1)*(Number(hit[2])*60+Number(hit[3]||0)):0;
  return utc-offset*60000;
}
export async function onRequestGet({env}){
 if(!env.ATLAS_DB)return json({status:"needs_configuration"},503);
 try{
  const today=dayRome(new Date());
  const [total,todays,archive,rank]=await env.ATLAS_DB.batch([
   env.ATLAS_DB.prepare("SELECT COUNT(*) AS count FROM matches WHERE game_start_ms>=?").bind(midnightRomeUtc(START)),
   env.ATLAS_DB.prepare("SELECT COUNT(*) AS count FROM matches WHERE game_start_ms>=? AND game_start_ms<?").bind(midnightRomeUtc(today),midnightRomeUtc(dayRome(new Date(Date.now()+36*3600*1000)))),
   env.ATLAS_DB.prepare("SELECT COUNT(*) AS count, MIN(game_start_ms) AS oldest, MAX(game_start_ms) AS newest FROM matches"),
   env.ATLAS_DB.prepare("SELECT queue_type,tier,division,lp,observed_at FROM rank_snapshots ORDER BY observed_at DESC,id DESC LIMIT 10")
  ]);
  return json({status:"ok",account:"daxs#EUW",trackingStart:START,timeZone:TZ,today,playedToday:todays.results[0].count,playedSinceStart:total.results[0].count,archivedMatches:archive.results[0].count,oldestArchivedAt:archive.results[0].oldest,newestArchivedAt:archive.results[0].newest,rankSnapshots:rank.results});
 }catch(err){console.error("archive summary failed",err);return json({status:"unavailable"},502);}
}