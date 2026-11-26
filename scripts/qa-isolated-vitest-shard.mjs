#!/usr/bin/env node
// Execute exactly the Vitest-discovered shard with isolated, bounded child
// processes. Never hide a failure, timeout, or empty/missing discovery result.
import {spawn,spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {relative,resolve} from "node:path";
const shard=process.argv[2];
if(!/^[1-8]\/8$/.test(shard||""))throw Error("INVALID_SHARD");
const cli=resolve("node_modules/vitest/vitest.mjs");
const discovered=spawnSync(process.execPath,[cli,"list","--filesOnly"],{
  encoding:"utf8",timeout:30000,env:{...process.env,NO_COLOR:"1",FORCE_COLOR:"0",CI:"true"},
});
if(discovered.error||discovered.status!==0)throw Error("VITEST_DISCOVERY_FAILED");
const discoveredFiles=discovered.stdout.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  .map(line=>relative(process.cwd(),resolve(line)).replaceAll("\\","/"));
if(!discoveredFiles.length || discoveredFiles.some(file=>! /^(src|server)\/.*\.(test|spec)\.tsx?$/.test(file)||!existsSync(file))||
   new Set(discoveredFiles).size!==discoveredFiles.length)throw Error("INVALID_OR_EMPTY_VITEST_DISCOVERY");
// Vitest list ignores --shard. Partition the same sorted complete file list
// deterministically on ALL matrix runners, without omissions or overlap.
const index=Number(shard.split("/")[0])-1;
const files=discoveredFiles.sort().filter((_,position)=>position%8===index);
if(!files.length)throw Error("EMPTY_SHARD");
console.log("SIGAPRO_SHARD_DISCOVERY "+shard+" "+files.length+" / "+discoveredFiles.length);
let cursor=0;const failures=[];
async function worker(){
  while(cursor<files.length){
    const file=files[cursor++];
    console.log("SIGAPRO_TEST_START "+file);
    const result=await new Promise(resolve=>{
      const child=spawn(process.execPath,[cli,"run",file,"--no-file-parallelism","--reporter=verbose"],{
        stdio:"inherit",detached:true,env:{...process.env,CI:"true"},
      });
      let timeout=false;
      const timer=setTimeout(()=>{
        timeout=true;
        try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}
      },45000);
      child.once("error",()=>{clearTimeout(timer);resolve("SPAWN_ERROR");});
      child.once("close",(code,signal)=>{clearTimeout(timer);resolve(timeout?"TIMEOUT":code===0?"PASS":"FAIL:"+String(code??signal));});
    });
    console.log("SIGAPRO_TEST_RESULT "+file+" "+result);
    if(result!=="PASS")failures.push({file,result});
  }
}
await Promise.all([worker(),worker()]);
console.log("SIGAPRO_SHARD_SUMMARY "+JSON.stringify({shard,total:files.length,passed:files.length-failures.length,failures}));
if(failures.length)process.exitCode=1;
