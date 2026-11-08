// Current Solo/Duo rank for daxs#EUW: never infer LP from archived matches.
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=60":"no-store","x-content-type-options":"nosniff"}});
async function get(host,path,key){
 const r=await fetch("https://"+host+".api.riotgames.com"+path,{headers:{"X-Riot-Token":key,"Accept":"application/json"}});
 if(!r.ok){const e=new Error("riot");e.status=r.status;throw e;}return r.json();
}
export async function onRequestGet({env}){
 if(!env.RIOT_API_KEY)return send({status:"unconfigured"},503);
 try{
  const account=await get("europe","/riot/account/v1/accounts/by-riot-id/daxs/EUW",env.RIOT_API_KEY);
  const entries=await get("euw1","/lol/league/v4/entries/by-puuid/"+encodeURIComponent(account.puuid),env.RIOT_API_KEY);
  const solo=entries.find(x=>x.queueType==="RANKED_SOLO_5x5");
  return send({status:"ok",account:"daxs#EUW",asOf:new Date().toISOString(),rank:solo?{tier:solo.tier,division:solo.rank,lp:solo.leaguePoints,wins:solo.wins,losses:solo.losses}:null,source:"riot_current"});
 }catch(e){
  const s=e.status;return send({status:s===429?"rate_limited":s===401||s===403?"riot_key_invalid":"unavailable"},s===429?429:503);
 }
}
