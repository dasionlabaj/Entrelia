// Safe Atlas telemetry: only fixed service names/codes, never messages, tokens or PUUIDs.
export async function recordError(env,component,code){
 if(!env.ATLAS_DB)return;
 const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,64)||"unknown";
 const c=safe(component),e=safe(code),fingerprint=c+":"+e;
 try{await env.ATLAS_DB.prepare("INSERT INTO atlas_errors(fingerprint,component,code) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET occurrences=occurrences+1,last_seen=CURRENT_TIMESTAMP").bind(fingerprint,c,e).run();}catch(_){}
}
export async function recordEvent(env,key,kind,component,summary){
 if(!env.ATLAS_DB)return;
 const clean=s=>String(s).replace(/[^a-zA-Z0-9_ :.-]/g,"").slice(0,120);
 try{await env.ATLAS_DB.prepare("INSERT OR IGNORE INTO atlas_events(event_key,kind,component,summary) VALUES(?,?,?,?)").bind(clean(key),clean(kind),clean(component),clean(summary)).run();}catch(_){}
}
