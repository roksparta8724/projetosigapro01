/**
 * CI-only real-browser exercise of the SAME renderer used by archiveAndOpenGuide.
 * Generates no payment, uses no user session, touches no Neon/R2 and never
 * creates a production entrypoint. Transient harness is removed after the test.
 */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const port = 4387;
const host = "127.0.0.1";
const harnessName = "qa-dam-original-browser-render.html";
const htmlPath = resolve(harnessName);
const page = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body><output id="qa-result" data-state="pending">Iniciando renderer do DAM</output>
<script type="module">
import { renderGuideOriginalPdf } from "/src/lib/guidePdf.ts";
const output=document.querySelector("#qa-result");
try {
  const crestResponse=await fetch("/qa-branding/campo-limpo-paulista.webp");
  if(!crestResponse.ok)throw new Error("Brasão de homologação ausente");
  const crest=new Uint8Array(await crestResponse.arrayBuffer());
  if(crest.byteLength!==4106)throw new Error("Brasão QA alterado");
  let binary="";for(const b of crest)binary+=String.fromCharCode(b);
  const logoUrl="data:image/webp;base64,"+btoa(binary);
  const props={
    prefeitura:{
      nome:"PREFEITURA DE CAMPO LIMPO PAULISTA — HOMOLOGAÇÃO",
      secretaria:"ORIGINAL SINTÉTICO — NÃO PAGAR",
      logoUrl
    },
    contribuinte:{nome:"CONTRIBUINTE SINTÉTICO — NÃO PAGAR",numeroCadastro:"QA-00001"},
    guia:{
      numeroGuia:"QA-REAL-RENDER-NÃO-PAGAR",
      dataDocumento:"2026-10-26T12:00:00.000Z",
      vencimento:"2026-11-05T00:00:00.000Z",
      bankEnvironment:"test",
      nonPayablePreview:true,
      paymentProvider:"mercado_pago",
      valorDocumento:35.24,
      valorCobrado:35.24,
      observacao:"HOMOLOGAÇÃO — NÃO PAGAR",
    },
    itens:[{ano:2026,divida:"Simulação de taxa — NÃO PAGAR",principal:35.24,total:35.24}],
  };
  // Renderer runs after the iframe and fonts load; timeout must be explicit,
  // not inferred from Chrome's early DOM snapshot of a pending operation.
  const timeoutId=setTimeout(()=>{
    if(output.dataset.state==="pending"){
      const frame=document.querySelector("iframe");
      const images=frame?.contentDocument?.images?.length??0;
      output.dataset.state="failed";
      output.textContent="SIGAPRO_REAL_RENDER_FAILED:real PDF not ready after 75000ms (frame="+Boolean(frame)+",images="+images+")";
    }
  },75000);
  const pdf=await renderGuideOriginalPdf(props);
  if(!(pdf instanceof Blob)||pdf.type!=="application/pdf")
    throw new Error("Renderizador não retornou Blob PDF");
  const bytes=new Uint8Array(await pdf.arrayBuffer());
  if(bytes.byteLength<3000 || String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")
    throw new Error("PDF do SIGAPRO vazio ou corrompido");
  clearTimeout(timeoutId);
  output.dataset.state="passed";
  output.textContent="SIGAPRO_REAL_RENDER_PASSED:"+bytes.byteLength;
}catch(error){
  output.dataset.state="failed";
  output.textContent="SIGAPRO_REAL_RENDER_FAILED:"+String(error?.message||error);
}
</script></body></html>`;
const command = process.execPath;
const viteEntry = resolve("node_modules", "vite", "bin", "vite.js");
let vite;
try {
  writeFileSync(htmlPath,page,"utf8");
  vite=spawn(command,[viteEntry,"--host",host,"--port",String(port),"--strictPort"],{
    stdio:["ignore","pipe","pipe"],env:{...process.env,CI:"true"}
  });
  let closed=false,stderr="";
  vite.on("exit",()=>{closed=true;});
  vite.stderr.on("data",b=>{stderr=(stderr+b.toString()).slice(-3000);});
  const base="http://"+host+":"+port;
  let ready=false;
  for(let i=0;i<100;i++){
    if(closed)throw new Error("Vite QA parou: "+stderr);
    try {const r=await fetch(base+"/"+harnessName);if(r.ok&&r.headers.get("content-type")?.includes("html")){ready=true;break;}}
    catch{/* Vite ainda iniciando */}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error("Vite QA não iniciou corretamente");
  const chrome=process.env.SIGAPRO_QA_CHROME||"google-chrome";
  const child=spawn(chrome,[
    "--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-background-networking","--no-first-run",
    "--virtual-time-budget=115000","--dump-dom",base+"/"+harnessName,
  ],{stdio:["ignore","pipe","pipe"]});
  let stdout="",browserError="";
  child.stdout.on("data",d=>{stdout+=d.toString();if(stdout.length>1e6)stdout=stdout.slice(-1e6);});
  child.stderr.on("data",d=>{browserError=(browserError+d.toString()).slice(-2500);});
  const status=await Promise.race([
    new Promise(resolve=>child.once("exit",code=>resolve(code))),
    new Promise(resolve=>setTimeout(()=>resolve("TIMEOUT"),145000)),
  ]);
  if(status==="TIMEOUT"){child.kill("SIGKILL");throw new Error("Chrome excedeu o tempo da renderização");}
  const result=stdout.match(/SIGAPRO_REAL_RENDER_(PASSED|FAILED):([^<]+)/);
  if(status!==0||!result||result[1]!=="PASSED")
    throw new Error(
      "Renderer real não passou: "+(result?.[0]||"sem resultado")+
      " | Chrome DOM: "+stdout.slice(0,2200).replace(/\\s+/g," ")+
      " | browser stderr: "+browserError.slice(-750)
    );
  console.log("PASS: actual SIGAPRO HTML-to-canvas-to-jsPDF renderer generated valid QA PDF ("+result[2].trim()+" bytes)");
}finally{
  // Kill the direct Vite process (not an npx wrapper that leaves a child alive).
  // This is a QA-only ephemeral server, never a production process.
  if(vite)vite.kill("SIGKILL");
  rmSync(htmlPath,{force:true});
}
