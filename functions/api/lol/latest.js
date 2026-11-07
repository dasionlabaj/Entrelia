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
    const ids=await riot("/lol/match/v5/matches/by-puuid/"+encodeURIComponent(account.puuid)+"/ids?start=0&count=2",env.RIOT_API_KEY);
    const matches=await Promise.all(ids.map(async id=>{
      const game=await riot("/lol/match/v5/matches/"+encodeURIComponent(id),env.RIOT_API_KEY);
      const p=game.info?.participants?.find(p=>p.puuid===account.puuid);
      if(!p)return null;
      return {id,champion:p.championName,kills:p.kills,deaths:p.deaths,assists:p.assists,win:p.win,mode:game.info.gameMode,durationSeconds:game.info.gameDuration,startedAt:game.info.gameStartTimestamp,queueId:game.info.queueId};
    }));
    return json({status:"ok",account:"daxs#EUW",matches:matches.filter(Boolean)});
  }catch(error){
    const s=error.status;
    if(s===401||s===403)return json({status:"riot_key_invalid",message:"La chiave Riot non è valida o è scaduta."},503);
    if(s===404)return json({status:"not_found",message:"Account Riot o partite non trovati."},404);
    if(s===429)return json({status:"rate_limited",message:"Limite Riot raggiunto: riprova tra poco."},429);
    return json({status:"unavailable",message:"Impossibile recuperare le partite Riot al momento."},502);
  }
}
