/** Limit external financial responses before decoding, including chunked bodies.
 * No response contents, provider credentials or error payloads are logged. */
export async function readBankJson(response:Response,maxBytes=1024*1024):Promise<unknown>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4*1024*1024)throw Error("BANK_RESPONSE_LIMIT_INVALID");
 const declared=response.headers.get("content-length");
 const media=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
 if((media!=="application/json"&&!/^application\/[a-z0-9.+-]+\+json$/.test(media))||
 (declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))){
  await response.body?.cancel().catch(()=>undefined);throw Error("BANK_RESPONSE_INVALID");
 }
 if(!response.body)throw Error("BANK_RESPONSE_INVALID");
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>maxBytes)throw Error("BANK_RESPONSE_TOO_LARGE");
   chunks.push(value);
  }
 }catch(e){await reader.cancel().catch(()=>undefined);throw e;}
 finally{reader.releaseLock();}
 if(total===0)throw Error("BANK_RESPONSE_INVALID");
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw Error("BANK_RESPONSE_INVALID");}
}
