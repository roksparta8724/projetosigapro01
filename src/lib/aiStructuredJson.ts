/**
 * Fail-closed parser for one structured JSON object returned by a PDF AI
 * provider. Models sometimes wrap valid JSON in an explanation or a fence.
 * Never auto-repair missing braces/quotes, choose between two objects, parse
 * executable syntax, or synthesize values from malformed JSON.
 */
export function parseOnePdfReadingJson(raw:string):Record<string,unknown>{
  if(typeof raw!=="string"||raw.length<2||raw.length>65000)
    throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
  const text=raw.trim();
  const candidates:string[]=[];
  let depth=0,start=-1,inString=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(start<0){
      if(c==="{"){start=i;depth=1;inString=false;escaped=false;}
      continue;
    }
    if(inString){
      if(escaped){escaped=false;continue;}
      if(c==="\\"){escaped=true;continue;}
      if(c==='"')inString=false;
      continue;
    }
    if(c==='"'){inString=true;continue;}
    if(c==="{"){
      depth++;
      if(depth>64)throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
    }
    if(c==="}"){
      depth--;
      if(depth===0){
        candidates.push(text.slice(start,i+1));
        start=-1;
        if(candidates.length>1)throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
      }
    }
  }
  if(start!==-1||candidates.length!==1)
    throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
  let parsed:unknown;
  try{parsed=JSON.parse(candidates[0]);}
  catch{throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
    throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
  const data=parsed as Record<string,unknown>;
  if(!["architectural_plan","other","uncertain"].includes(String(data.document_type))||
     typeof data.has_site_plan!=="boolean"||
     !Array.isArray(data.metrics)||!Array.isArray(data.warnings)||
     data.metrics.length>50||data.warnings.length>50)
    throw new Error("CLOUDFLARE_MODEL_INVALID_JSON");
  return data;
}
