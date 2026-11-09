// Atlas DAX historical match importer: private, bounded, idempotent.
// POST /api/admin/lol/backfill with { "start": 0, "count": 20 }.
// Requires server secret ATLAS_SYNC_TOKEN; never expose this token to the public website.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function authorized(header,secret){
 if(!header||!secret)return false;
 const a=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header));
 const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
 return new Uint8Array(a).every((value,i)=>value===new Uint8Array(b)[i]);
}
// Per-invocation pacing only: a shared coordinator is still required for global limits.
function pacedRiot(key){
 let nextAllowed=0;
 return async function riot(path){
  const delay=Math.max(0,nextAllowed-Date.now());
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  nextAllowed=Date.now()+1500;
  const response=await fetch("https://europe.api.riotgames.com"+path,{headers:{"X-Riot-Token":key,Accept:"application/json"}});
  if(!response.ok){
   const error=new Error("riot_error");
   error.status=response.status;
   error.retryAfter=response.headers.get("Retry-After");
   throw error;
  }
  return response.json();
 };
}
function simplify(game,puuid,id){
 const p=game.info?.participants?.find(x=>x.puuid===puuid);
 if(!p)return null;
 const participants=(game.info?.participants||[]).map(player=>({
  puuid:player.puuid,teamId:player.teamId,champion:player.championName,
  name:player.riotIdGameName||player.summonerName||"Giocatore",tag:player.riotIdTagline||"",
  kills:player.kills,deaths:player.deaths,assists:player.assists,win:player.win,
  damageDealt:player.totalDamageDealtToChampions,damageTaken:player.totalDamageTaken,
  physicalDamage:player.physicalDamageDealtToChampions,magicDamage:player.magicDamageDealtToChampions,
  trueDamage:player.trueDamageDealtToChampions,gold:player.goldEarned,
  cs:(player.totalMinionsKilled||0)+(player.neutralMinionsKilled||0),vision:player.visionScore,
  wardsPlaced:player.wardsPlaced,wardsKilled:player.wardsKilled,healing:player.totalHeal,
  shielding:player.totalDamageShieldedOnTeammates,turretDamage:player.damageDealtToTurrets,
  objectiveDamage:player.damageDealtToObjectives
 }));
 return {participants,teamId:p.teamId,puuid,id,champion:p.championName,kills:p.kills,
  deaths:p.deaths,assists:p.assists,damageDealt:p.totalDamageDealtToChampions,
  damageTaken:p.totalDamageTaken,physicalDamageTaken:p.physicalDamageTaken,
  magicDamageTaken:p.magicDamageTaken,trueDamageTaken:p.trueDamageTaken,
  totalDamageDealt:p.totalDamageDealt,totalPhysicalDamageDealt:p.physicalDamageDealt,
  totalMagicDamageDealt:p.magicDamageDealt,totalTrueDamageDealt:p.trueDamageDealt,
  damageSelfMitigated:p.damageSelfMitigated,totalHealsOnTeammates:p.totalHealsOnTeammates,
  physicalDamage:p.physicalDamageDealtToChampions,magicDamage:p.magicDamageDealtToChampions,
  trueDamage:p.trueDamageDealtToChampions,gold:p.goldEarned,
  cs:(p.totalMinionsKilled||0)+(p.neutralMinionsKilled||0),vision:p.visionScore,
  wardsPlaced:p.wardsPlaced,wardsKilled:p.wardsKilled,healing:p.totalHeal,
  shielding:p.totalDamageShieldedOnTeammates,ccSeconds:p.timeCCingOthers,
  turretDamage:p.damageDealtToTurrets,objectiveDamage:p.damageDealtToObjectives,
  level:p.champLevel,position:p.teamPosition,items:[p.item0,p.item1,p.item2,p.item3,p.item4,p.item5,p.item6],
  win:p.win,mode:game.info.gameMode,durationSeconds:game.info.gameDuration,
  startedAt:game.info.gameStartTimestamp,queueId:game.info.queueId
 };
}
export async function onRequestPost({request,env}){
 if(!env.ATLAS_SYNC_TOKEN||!env.RIOT_API_KEY||!env.ATLAS_DB)
  return respond({status:"not_configured",message:"Private sync requires ATLAS_SYNC_TOKEN, RIOT_API_KEY and ATLAS_DB."},503);
 if(!await authorized(request.headers.get("X-Atlas-Sync-Key"),env.ATLAS_SYNC_TOKEN))
  return respond({status:"unauthorized"},401);
 let options;
 try{options=await request.json();}catch{return respond({status:"bad_request"},400);}
 const start=options?.start,count=options?.count??10;
 if(!Number.isInteger(start)||start<0||start>1000||!Number.isInteger(count)||count<1||count>20)
  return respond({status:"invalid_range",message:"Use start >= 0 and count 1..20."},400);
 try{
  const riot=pacedRiot(env.RIOT_API_KEY);
  const account=await riot("/riot/account/v1/accounts/by-riot-id/daxs/EUW");
  const ids=await riot("/lol/match/v5/matches/by-puuid/"+encodeURIComponent(account.puuid)+"/ids?start="+start+"&count="+count);
  const known=new Set();
  if(ids.length){
   const query="SELECT match_id FROM matches WHERE match_id IN ("+ids.map(()=>"?").join(",")+")";
   const rows=await env.ATLAS_DB.prepare(query).bind(...ids).all();
   for(const row of rows.results||[])known.add(row.match_id);
  }
  const missing=ids.filter(id=>!known.has(id));
  let downloaded=0;
  // Sequential requests prevent bursts within this invocation.
  // Save each match immediately so a later 429 does not discard earlier progress.
  for(const id of missing){
   let game;
   try{
    game=await riot("/lol/match/v5/matches/"+encodeURIComponent(id));
   }catch(e){
    if(e.status===429){
     return respond({status:"rate_limited",account:"daxs#EUW",
      message:"Riot rate limit: resume the same batch after retryAfter.",
      requested:count,listed:ids.length,reused:known.size,downloaded,
      retryAfter:e.retryAfter||null,nextStart:start},429);
    }
    throw e;
   }
   const m=simplify(game,account.puuid,id);
   if(!m)continue;
   await env.ATLAS_DB.prepare(
    "INSERT OR IGNORE INTO matches (match_id,puuid,game_start_ms,game_end_ms,queue_id,game_mode,champion,win,kills,deaths,assists,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
   ).bind(m.id,account.puuid,m.startedAt,m.startedAt+Math.round((m.durationSeconds||0)*1000),
    m.queueId,m.mode,m.champion,m.win?1:0,m.kills,m.deaths,m.assists,JSON.stringify(m)).run();
   downloaded++;
  }
  return respond({status:"ok",account:"daxs#EUW",requested:count,listed:ids.length,
   reused:known.size,downloaded,nextStart:start+ids.length,
   hasMore:ids.length===count});
 }catch(e){
  const code=e.status===429?429:e.status===401||e.status===403?503:502;
  return respond({status:code===429?"rate_limited":"upstream_unavailable",
   message:code===429?"Riot rate limit: retry this batch later.":"Private backfill failed; retry the same start.",
   retryAfter:e.retryAfter||null},code);
 }
}
