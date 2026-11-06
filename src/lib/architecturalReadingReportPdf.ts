import { jsPDF } from "jspdf";
import type { DrawingExtraction } from "./architecturalPdfReadings.js";
import type { UrbanTerritorialReadiness } from "./urbanTerritorialReadiness.js";
import type { UrbanExistingLegalBaseline } from "./urbanExistingLegalBaseline.js";
import { URBAN_METRICS } from "./urbanPrecheck.js";

/**
 * Identificação institucional de origem processual.
 * These are DECLARED details, not land-registry/cadastral proof.
 */
export type ArchitecturalReportIdentification = {
  municipalityId?: string;
  municipalityName?: string;
  protocol?: string;
  ownerName?: string;
  ownerDocument?: string;
  professionalName?: string;
  propertyAddress?: string;
  propertyRegistration?: string;
  lot?: string;
  block?: string;
  declaredUse?: string;
};

/**
 * PDF técnico A4, independente do viewer e de credenciais.
 * Modalidades distintas possuem título, escopo e advertência específicos.
 * Não constitui despacho, verificação geométrica nem parecer de aprovação.
 */
export function createArchitecturalReadingReportPdf(input: {
  extraction: DrawingExtraction & { aiProvider?:string };
  processId: string;
  documentId: string;
  documentVersion: number;
  fileName: string;
  identification?: ArchitecturalReportIdentification;
  territorial?: UrbanTerritorialReadiness | null;
  legalBaseline?: UrbanExistingLegalBaseline | null;
  generatedAt?: Date;
}) {
  if (!input.processId || !input.documentId ||
      !Number.isInteger(input.documentVersion) || input.documentVersion < 1 ||
      !input.fileName.trim() || !Array.isArray(input.extraction.readings) ||
      input.extraction.automaticallyApproved !== false) {
    throw new Error("Dados do documento insuficientes para gerar o relatorio.");
  }
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  pdf.setProperties({title:"SIGAPRO - Relatorio preliminar de leitura arquitetonica",
    subject:"Evidencias tecnicas para conferencia humana",author:"SIGAPRO"});
  const NAVY:[number,number,number]=[12,37,61];
  const BLUE:[number,number,number]=[19,89,126];
  const INK:[number,number,number]=[28,47,66];
  const MUTED:[number,number,number]=[88,105,121];
  const GRAY:[number,number,number]=[242,246,250];
  const GOLD:[number,number,number]=[151,91,24];
  const LEFT=17,RIGHT=193,WIDTH=RIGHT-LEFT,BOTTOM=270;
  const identity=input.identification||{};
  const municipality=identity.municipalityName?.trim()||"PREFEITURA NAO IDENTIFICADA";
  const protocol=identity.protocol?.trim()||input.processId;
  const kind=input.extraction.source;
  const modeName=kind==="pdf_text_local"?"EXTRACAO LOCAL DE COTAS":
    kind==="ai_pdf_text"?"INTERPRETACAO DE TEXTO POR IA":"LEITURA VISUAL POR IA";
  const method=kind==="pdf_text_local"
    ?"Extracao de texto selecionavel sem chamada a provedor externo."
    :kind==="ai_pdf_text"
      ?"Interpretacao automatizada da camada textual. Nao examina o desenho como imagem."
      :"Processamento visual por provedor externo. As cotas exigem conferencia na prancha.";
  const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\r\n\t]+/g," ")
    .replace(/[^\u0020-\u00FF]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const font=(size:number,bold=false,color:readonly [number,number,number]=INK)=>{
    pdf.setFont("helvetica",bold?"bold":"normal");
    pdf.setFontSize(size);pdf.setTextColor(color[0],color[1],color[2]);
  };
  let y=0;
  const head=(first:boolean)=>{
    pdf.setFillColor(...NAVY);
    pdf.rect(0,0,210,first?36:18,"F");
    pdf.setFillColor(32,160,190);
    pdf.rect(0,first?35:17,210,1.3,"F");
    font(first?18:11,true,[255,255,255]);
    pdf.text("SIGAPRO",LEFT,first?15:11.5);
    if(first){
      font(9.5,true,[221,239,248]);
      pdf.text(clean(municipality,68),LEFT,23);
      font(9,true,[255,255,255]);
      pdf.text(modeName,LEFT,30);
    }else{
      font(8.5,true,[230,240,250]);
      pdf.text(clean(modeName,52),RIGHT,11.5,{align:"right"});
    }
    y=first?42:26;
  };
  const newPage=()=>{pdf.addPage();head(false);};
  const ensure=(height:number)=>{if(y+height>BOTTOM)newPage();};
  const body=(value:unknown,size=9,color:readonly [number,number,number]=INK)=>{
    const text=clean(value,1800);if(!text)return;
    font(size,false,color);
    const lines=pdf.splitTextToSize(text,WIDTH);
    const height=size>=9?4.8:4.2;
    for(const line of lines){
      ensure(height+2);font(size,false,color);
      pdf.text(line,LEFT,y);
      y+=height;
    }
    y+=1.6;
  };
  const section=(label:string)=>{
    ensure(16);
    y+=3;
    pdf.setFillColor(...GRAY);
    pdf.roundedRect(LEFT,y-4,WIDTH,10,2,2,"F");
    pdf.setFillColor(...BLUE);
    pdf.rect(LEFT,y-4,2.5,10,"F");
    font(10.4,true,NAVY);
    pdf.text(clean(label),LEFT+6,y+2.5);
    y+=12;
  };
  const field=(label:string,value:unknown)=>{
    const source=clean(value,600)||"Nao informado no cadastro do processo";
    font(8.9,false,INK);
    const wrapped=pdf.splitTextToSize(source,110) as string[];
    const height=Math.max(9.4,wrapped.length*4.5+3.5);
    ensure(height+1.3);
    pdf.setFillColor(249,251,253);
    pdf.setDrawColor(225,233,241);
    pdf.roundedRect(LEFT,y,WIDTH,height,1.5,1.5,"FD");
    font(8.1,true,MUTED);
    pdf.text(clean(label,40),LEFT+3,y+5.8);
    font(8.9,true,INK);
    wrapped.forEach((line,index)=>pdf.text(line,LEFT+64,y+5.8+index*4.5));
    y+=height+1.3;
  };
  const banner=(title:string,detail:string,positive=false)=>{
    font(9,false,INK);
    const lines=pdf.splitTextToSize(clean(detail,900),WIDTH-9) as string[];
    const height=13+Math.max(1,lines.length)*4.4;
    ensure(height+2);
    pdf.setFillColor(positive?236:255,positive?249:248,positive?244:231);
    pdf.setDrawColor(positive?165:236,positive?217:201,positive?195:151);
    pdf.roundedRect(LEFT,y,WIDTH,height,2.5,2.5,"FD");
    font(9.7,true,positive?BLUE:GOLD);
    pdf.text(clean(title,90),LEFT+4,y+6);
    font(8.7,false,INK);
    lines.forEach((line,index)=>pdf.text(line,LEFT+4,y+12+index*4.4));
    y+=height+4;
  };
  const small=(label:string,value:string)=>{
    ensure(8);
    font(8.4,true,BLUE);
    pdf.text(clean(label,50),LEFT,y);
    font(8.5,false,INK);
    const val=pdf.splitTextToSize(clean(value,500),112) as string[];
    val.forEach((line,index)=>{if(index>0)ensure(4.5);pdf.text(line,LEFT+64,y+index*4.5);});
    y+=Math.max(6,val.length*4.5)+1.4;
  };
  head(true);
  banner("DOCUMENTO DE APOIO TECNICO - NAO E PARECER",
    "Esta extracao nao defere, indefere ou altera o processo. Medidas so podem ser utilizadas apos conferencia pelo analista.");
  section("Identificacao institucional e do requerimento");
  field("Prefeitura",municipality);
  field("Protocolo / processo",protocol);
  field("Proprietario",identity.ownerName);
  field("CPF/CNPJ declarado",identity.ownerDocument);
  field("Responsavel tecnico",identity.professionalName);
  field("Endereco declarado",identity.propertyAddress);
  field("Inscricao / IPTU",identity.propertyRegistration);
  field("Lote / quadra",(identity.lot?.trim()||"Nao informado")+" / "+
    (identity.block?.trim()||"Nao informado"));
  if(identity.declaredUse?.trim())field("Uso declarado",identity.declaredUse);
  body("Identificacao obtida do cadastro processual. Nao prova matricula, titularidade ou localizacao georreferenciada.",8,MUTED);
  section("Documento e metodologia");
  small("Arquivo examinado",input.fileName);
  small("Versao",String(input.documentVersion));
  small("Identificador",input.documentId);
  small("Emissao",(input.generatedAt||new Date()).toLocaleString("pt-BR"));
  small("Modalidade",method);
  if(input.extraction.aiProvider?.trim())small("Provedor",input.extraction.aiProvider);
  const found=input.extraction.readings.filter(x=>x.value!==null&&x.usableForReview);
  const missing=input.extraction.readings.filter(x=>x.value===null||!x.usableForReview);
  section("Resultado executivo da leitura");
  banner(found.length+" INDICES COM COTAS DOCUMENTADAS",
    "Foram retornados "+found.length+" de "+input.extraction.readings.length+
    " indices previstos. "+missing.length+" indice(s) continuam sem medida verificavel."+
    " O exame e preliminar e nao comprova geometria CAD nem atendimento a normas.",found.length>0);
  const audit=input.extraction.pageAudit;
  section("Inventario de paginas e escopo verificado");
  if(audit){
    small("Paginas do PDF",audit.countVerified?String(audit.count):"Contagem nao comprovada");
    small("Com cotas citadas",audit.evidencePages.length?audit.evidencePages.join(", "):"Nenhuma confirmada");
    small("Sem cotas citadas",audit.countVerified
      ?(audit.pagesWithoutMeasurementEvidence.join(", ")||"Nenhuma")
      :"Nao identificaveis com seguranca");
    body(audit.note,8,MUTED);
  }else body("Inventario estrutural nao fornecido. A verificacao integral da planta nao foi comprovada.",8,MUTED);
  body("A contagem e a extracao textual nao equivalem a leitura visual nem a conferencia de todas as pranchas.",8,GOLD);
  if(input.extraction.source==="pdf_text_local"&&input.extraction.textCoverage){
    const c=input.extraction.textCoverage;
    small("Paginas varridas pelo extrator de texto",String(c.pagesRead));
    small("Com texto selecionavel",c.pagesWithText.join(", ")||"Nenhuma");
    small("Sem texto selecionavel",c.pagesWithoutText.join(", ")||"Nenhuma");
    body("Uma pagina com texto pode ter desenhos e cotas visuais que esta modalidade nao consegue examinar.",8,MUTED);
  }
  section("Quadro de medidas identificadas");
  if(!found.length)body("Nenhuma medida foi comprovada nesta modalidade. O analista deve consultar o desenho original.");
  for(const row of found){
    const metric=URBAN_METRICS.find(m=>m.key===row.metric);
    if(!metric)continue;
    ensure(22);
    pdf.setFillColor(...GRAY);
    pdf.roundedRect(LEFT,y,WIDTH,9.5,1.6,1.6,"F");
    font(9,true,NAVY);pdf.text(clean(metric.label,48),LEFT+3,y+6);
    const reading=row.value!.toLocaleString("pt-BR")+" "+metric.unit;
    font(9.4,true,BLUE);pdf.text(clean(reading,27),RIGHT-44,y+6);
    font(8,false,MUTED);pdf.text("p. "+row.page,RIGHT-3,y+6,{align:"right"});
    y+=12;
    body("Fonte textual da cota: "+row.quote,8,MUTED);
  }
  if(input.extraction.supplementaryFacts?.length){
    section("Outras cotas declaradas nas pranchas");
    body("Valores complementares para verificacao; nao sao indices legais nem aprovacao.",8,MUTED);
    for(const fact of input.extraction.supplementaryFacts.slice(0,12)){
      body(fact.label+": "+fact.value.toLocaleString("pt-BR")+" "+fact.unit+
        "  |  Pagina "+fact.page,9,INK);
      body("Trecho: "+fact.quote,8,MUTED);
    }
  }
  section("Indices que ainda exigem verificacao");
  if(missing.length){
    const labels=missing.map(x=>URBAN_METRICS.find(m=>m.key===x.metric)?.label||x.metric);
    body(labels.join("  |  "),8.6);
    body("Nao identificados NAO significa fora da lei. Podem faltar na prancha, estar ilegiveis ou exigir verificacao visual.",8,MUTED);
  }else body("Todos os indices retornados tem cota candidata, sem dispensar conferencia humana.",8,MUTED);
  section("Situacao territorial e zoneamento");
  const t=input.territorial;
  const linked=t?.cadastralLink==="linked";
  const verified=t?.zoneVerified===true&&Boolean(t.zoneCode);
  banner(linked?(verified?"ZONA CARTOGRAFICA IDENTIFICADA":"IMOVEL VINCULADO, ZONA PENDENTE"):
    "PENDENTE DE VINCULO IMOBILIARIO",
    linked
      ?verified?"Zona "+t?.zoneCode+" indicada por mapa verificado; uso e validade juridica ainda exigem conferencia."
        :"O cadastro foi localizado, mas a delimitacao oficial do zoneamento ainda precisa ser demonstrada."
      :"O cadastro georreferenciado do lote nao foi vinculado ao processo. Isso nao e irregularidade comprovada; a situacao NAO equivale a nao conformidade.");
  small("Endereco cadastral",t?.address||"Nao comprovado");
  small("Inscricao cadastral",t?.registration||t?.iptu||"Nao comprovada");
  small("Zona declarada",t?.zoneCandidate||"Nao identificada");
  small("Zona espacial",verified?String(t?.zoneCode):"Nao validada");
  if(verified){
    small("Mapa oficial",t?.mapVersion||"Nao informado");
    small("Base legal do mapa",t?.mapLegalReference||"Nao informada");
  }
  section("Parametros legais e historico municipal");
  const base=input.legalBaseline;
  if(base?.status==="available"){
    small("Quadro I",base.quadroI.reviewed+"/"+base.quadroI.rows+
      " leituras revisadas; "+base.quadroI.needsCorrection+" ressalva(s)");
    small("Quadro II",base.quadroII.draftEntries+" rascunhos sem vigencia validada");
    small("Acervo em cadastro",base.documents.map(x=>x.name).join(" / ")||"Nao informado");
    small("Normas reais ativas",String(base.activeRealRegulations));
    small("Escopos legais verificados",String(base.verifiedLegalScopes));
    body("Os quadros e evidencias historicas sao preparatorios. Nao foram promovidos automaticamente a norma vigente.",8,MUTED);
  }else{
    body("Nao foi possivel confirmar a matriz legal municipal por este relatorio. Isso nao demonstra perda dos arquivos cadastrados.",8,MUTED);
  }
  section("Alertas tecnicos");
  const warnings=[...new Set(input.extraction.warnings.map(x=>clean(x,300)).filter(Boolean))];
  if(!warnings.length)body("Nenhum alerta adicional nesta extracao.");
  for(const warning of warnings.slice(0,5))body("- "+warning,8.3,INK);
  if(warnings.length>5)body("Outros "+(warnings.length-5)+" avisos constam da leitura original. Consulte o painel tecnico.",8,MUTED);
  section("Situacao da conformidade urbanistica");
  banner("NAO AVALIADA - NAO SIGNIFICA NAO CONFORME",
    "Sem vinculacao territorial, regra vigente e evidencias por zona, uso e indice, nao e possivel emitir parecer de deferimento ou indeferimento.");
  body("Documento informativo para conferencia tecnica. Nenhum dado foi aplicado, assinado ou aprovado automaticamente pelo download deste arquivo.",8,MUTED);
  const total=pdf.getNumberOfPages();
  for(let i=1;i<=total;i++){
    pdf.setPage(i);
    pdf.setDrawColor(216,227,235);
    pdf.line(LEFT,278,RIGHT,278);
    font(7.4,false,MUTED);
    pdf.text("SIGAPRO  |  Leitura preliminar, sem efeito de aprovacao.",LEFT,285);
    pdf.text("Protocolo "+clean(protocol,34)+"  ·  "+i+" / "+total,RIGHT,285,{align:"right"});
  }
  return pdf;
}
