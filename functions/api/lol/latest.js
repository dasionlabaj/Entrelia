import { recordError, recordEvent } from "../../lib/atlas-observability.js";
// Cloudflare Pages Function: GET /api/lol/latest
// Reads the Riot key only from the server-side RIOT_API_KEY environment secret.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":status===200?"public, max-age=60":"no-store","X-Content-Type-Options":"nosniff"}});
async function riot(path,key){
  const response=await fetch("https://europe.api.riotgames.com"+path,{headers:{"X-Riot-Token":key,"Accept":"application/json"}});
  if(!response.ok){
    const err=new Error("riot_error");err.status=response.status;throw err;
  }
  return response.json();
}
export async function onRequestGet({env}){
  if(!env.RIOT_API_KEY)return json({status:"needs_configuration",message:"Connessione Riot non configurata: manca il segreto RIOT_API_KEY su Cloudflare."},503);
  try{
    const account=await riot("/riot/account/v1/accounts/by-riot-id/daxs/EUW",env.RIOT_API_KEY);
    const ids=await riot("/lol/match/v5/matches/by-puuid/"+encodeURIComponent(account.puuid)+"/ids?start=0&count=20",env.RIOT_API_KEY);
    const matches=await Promise.all(ids.map(async id=>{
      const game=await riot("/lol/match/v5/matches/"+encodeURIComponent(id),env.RIOT_API_KEY);
      const p=game.info?.participants?.find(p=>p.puuid===account.puuid);
      if(!p)return null;
      const participants=(game.info?.participants||[]).map(player=>({
        puuid:player.puuid,teamId:player.teamId,champion:player.championName,
        name:player.riotIdGameName||player.summonerName||"Giocatore",
        tag:player.riotIdTagline||"",kills:player.kills,deaths:player.deaths,
        assists:player.assists,win:player.win,
        damageDealt:player.totalDamageDealtToChampions,damageTaken:player.totalDamageTaken,
        physicalDamage:player.physicalDamageDealtToChampions,
        magicDamage:player.magicDamageDealtToChampions,trueDamage:player.trueDamageDealtToChampions,
        gold:player.goldEarned,cs:(player.totalMinionsKilled||0)+(player.neutralMinionsKilled||0),
        vision:player.visionScore,wardsPlaced:player.wardsPlaced,wardsKilled:player.wardsKilled,
        healing:player.totalHeal,shielding:player.totalDamageShieldedOnTeammates,
        turretDamage:player.damageDealtToTurrets,objectiveDamage:player.damageDealtToObjectives
      }));
      return {participants,teamId:p.teamId,puuid:account.puuid,id,champion:p.championName,kills:p.kills,deaths:p.deaths,assists:p.assists,damageDealt:p.totalDamageDealtToChampions,damageTaken:p.totalDamageTaken,physicalDamageTaken:p.physicalDamageTaken,magicDamageTaken:p.magicDamageTaken,trueDamageTaken:p.trueDamageTaken,totalDamageDealt:p.totalDamageDealt,totalPhysicalDamageDealt:p.physicalDamageDealt,totalMagicDamageDealt:p.magicDamageDealt,totalTrueDamageDealt:p.trueDamageDealt,damageSelfMitigated:p.damageSelfMitigated,totalHealsOnTeammates:p.totalHealsOnTeammates,physicalDamage:p.physicalDamageDealtToChampions,magicDamage:p.magicDamageDealtToChampions,trueDamage:p.trueDamageDealtToChampions,gold:p.goldEarned,cs:(p.totalMinionsKilled||0)+(p.neutralMinionsKilled||0),vision:p.visionScore,wardsPlaced:p.wardsPlaced,wardsKilled:p.wardsKilled,healing:p.totalHeal,shielding:p.totalDamageShieldedOnTeammates,ccSeconds:p.timeCCingOthers,turretDamage:p.damageDealtToTurrets,objectiveDamage:p.damageDealtToObjectives,level:p.champLevel,position:p.teamPosition,items:[p.item0,p.item1,p.item2,p.item3,p.item4,p.item5,p.item6],win:p.win,mode:game.info.gameMode,durationSeconds:game.info.gameDuration,startedAt:game.info.gameStartTimestamp,queueId:game.info.queueId};
    }));
    const validMatches=matches.filter(Boolean);
    // An archive write is idempotent: re-fetching the same Riot match never duplicates it.
    // Keep the original latest-match API usable if D1 is temporarily unavailable.
    let archive={status:"unconfigured"};
    if(env.ATLAS_DB){
      try{
        if(validMatches.length){
          const statements=validMatches.map(m=>env.ATLAS_DB.prepare(
            "INSERT OR IGNORE INTO matches (match_id,puuid,game_start_ms,game_end_ms,queue_id,game_mode,champion,win,kills,deaths,assists,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
          ).bind(m.id,account.puuid,m.startedAt,
            m.startedAt+Math.round((m.durationSeconds||0)*1000),
            m.queueId,m.mode,m.champion,m.win?1:0,m.kills,m.deaths,m.assists,JSON.stringify(m)));
          await env.ATLAS_DB.batch(statements);
        }
        archive={status:"ok",observed:validMatches.length};
        if(validMatches.length)await recordEvent(env,"match-"+validMatches[0].id,"match_observed","riot_sync","Latest match observed and archive write completed");
      }catch(e){
        console.error("Atlas D1 archive insert failed",e);
        archive={status:"unavailable"};
        await recordError(env,"archive","insert_failed");
      }
    }
    return json({status:"ok",account:"daxs#EUW",matches:validMatches,archive});
  }catch(error){
    const s=error.status;
    await recordError(env,"riot_latest",s===429?"rate_limited":s===401||s===403?"auth_error":s===404?"not_found":"upstream_error");
    if(s===401||s===403)return json({status:"riot_key_invalid",message:"La chiave Riot non è valida o è scaduta."},503);
    if(s===404)return json({status:"not_found",message:"Account Riot o partite non trovati."},404);
    if(s===429)return json({status:"rate_limited",message:"Limite Riot raggiunto: riprova tra poco."},429);
    return json({status:"unavailable",message:"Impossibile recuperare le partite Riot al momento."},502);
  }
}
