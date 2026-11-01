/** QA-only synthetic three-sheet architectural sample for process 000004/2026.
 * This is never a professional project, official attachment, or approved plan.
 * Generated client-side, no backend storage, and no citizen data.
 */
export async function createUrbanQaProcess04Fixture():Promise<File> {
 const {jsPDF}=await import("jspdf");
 const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a3",compress:true});
 const W=doc.internal.pageSize.getWidth();
 const H=doc.internal.pageSize.getHeight();
 const dark=[15,48,71] as const,blue=[20,92,135] as const,gray=[83,103,118] as const;
 const text=(x:number,y:number,value:string,size=11,bold=false)=>{
   doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);
   const tone=bold?dark:gray;doc.setTextColor(tone[0],tone[1],tone[2]);doc.text(value,x,y);
 };
 const header=(page:number,title:string)=>{
   doc.setFillColor(...dark);doc.rect(0,0,W,89,"F");
   doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(17);
   doc.text("SIGAPRO  |  PROJETO ARQUITETONICO FICTICIO - HOMOLOGACAO",40,37);
   doc.setFontSize(11);doc.setFont("helvetica","normal");
   doc.text("PROCESSO QA 000004/2026  -  TESTE DE LEITURA, NAO E UM PROJETO TECNICO",40,61);
   text(43,125,title,20,true);
   doc.setDrawColor(211,223,232);doc.line(40,H-60,W-40,H-60);
   doc.setTextColor(177,75,31);doc.setFont("helvetica","bold");doc.setFontSize(9);
   doc.text("DOCUMENTO FICTICIO - SEM VALIDADE TECNICA, LEGAL OU PROFISSIONAL",42,H-37);
   doc.setTextColor(...gray);doc.text("PRANCHA "+page+"/3",W-147,H-37);
 };
 const line=(x1:number,y1:number,x2:number,y2:number)=>{
   doc.setDrawColor(...blue);doc.setLineWidth(1);doc.line(x1,y1,x2,y2);
 };
 header(1,"QA-01  |  IMPLANTACAO ESQUEMATICA");
 text(52,151,"Terreno de teste 15 x 20 metros. Projecao de edificio 10 x 12 metros.",11);
 // Plan vector. Scale is schematic and is not used as a source of numeric truth.
 const x=175,y=215,s=20;
 doc.setDrawColor(...dark);doc.setLineWidth(3);doc.rect(x,y,15*s,20*s);
 doc.setFillColor(225,242,250);doc.setDrawColor(...blue);doc.setLineWidth(2.3);
 doc.rect(x+2*s,y+3*s,10*s,12*s,"FD");
 doc.setFillColor(214,239,219);doc.rect(x+12*s,y+17,2*s,16*s,"F");
 text(x+45,y+152,"EDIFICACAO",14,true);
 text(x+36,y+177,"PROJECAO 120 m2",10);
 line(x,y-20,x+15*s,y-20);text(x+122,y-27,"15,00 m",10,true);
 line(x-18,y,x-18,y+20*s);text(x-88,y+195,"20,00 m",10,true);
 text(705,250,"COTAS ESQUEMATICAS",15,true);
 [
  "LOTE: 15,00 x 20,00 m",
  "EDIFICACAO: 10,00 x 12,00 m",
  "FRENTE: 5,00 m",
  "LATERAL ESQUERDA: 2,00 m",
  "LATERAL DIREITA: 3,00 m",
  "FUNDOS: 3,00 m",
  "USO SIMULADO: COMERCIAL",
  "ZONA SIMULADA: ZM-B(e)",
 ].forEach((v,i)=>{text(713,294+i*34,v,12,i===0);doc.setDrawColor(223,232,239);doc.line(710,302+i*34,1075,302+i*34);});
 text(52,680,"A planta e um desenho de demonstracao; o leitor deve priorizar declaracoes inequivocas da prancha 03.",11);
 doc.addPage();
 header(2,"QA-02  |  PAVIMENTOS ILUSTRATIVOS");
 text(59,152,"Ambientes e divisorias esquematicos. Nao representam responsabilidade tecnica.",11);
 const floor=(xx:number,yy:number,w:number,h:number,title:string,area:string)=>{
   doc.setDrawColor(...dark);doc.setLineWidth(2.4);doc.rect(xx,yy,w,h);
   line(xx+w*.48,yy,xx+w*.48,yy+h);line(xx,yy+h*.54,xx+w,yy+h*.54);
   text(xx,yy-21,title,15,true);text(xx,yy+h+31,"AREA COMPUTAVEL: "+area,12,true);
   text(xx+24,yy+75,"AMBIENTE 01",10);text(xx+w*.52,yy+75,"AMBIENTE 02",10);
 };
 floor(110,236,322,360,"TERREO","120,00 m2");
 floor(638,236,180,275,"PAVIMENTO SUPERIOR","60,00 m2");
 text(910,252,"CORTE ESQUEMATICO",13,true);
 doc.setDrawColor(...dark);doc.rect(935,316,130,140);
 line(935,383,1065,383);
 text(945,362,"NIVEL 2",10);text(945,423,"NIVEL 1",10);
 text(904,486,"Altura ilustrativa: 7,50 m",11);
 text(56,698,"Nao usar esta prancha como substituta de ART/RRT, levantamento ou projeto de engenharia.",11);
 doc.addPage();
 header(3,"QA-03  |  DECLARACOES TEXTUAIS DO PROJETO");
 text(47,152,"Valores exclusivos da SIMULACAO. Nao sao indices legais da LC 379/2009.",11);
 const measures=[
 "RECUO FRONTAL: 5,00 m",
 "RECUO LATERAL: 2,00 m",
 "RECUO FUNDOS: 3,00 m",
 "TAXA DE OCUPACAO: 40 %",
 "TAXA DE PERMEABILIDADE: 30 %",
 "COEFICIENTE DE APROVEITAMENTO: 0,60",
 "ALTURA DA EDIFICACAO: 7,50 m",
 "NUMERO DE PAVIMENTOS: 2",
 ];
 text(58,203,"COTAS E INDICES DECLARADOS",14,true);
 measures.forEach((v,i)=>{const yy=254+i*53;text(65,yy,v,12,true);doc.setDrawColor(221,230,238);doc.line(60,yy+15,555,yy+15);});
 text(641,203,"AREAS DECLARADAS",14,true);
 [
 "AREA TOTAL DO TERRENO: 300,00 m2",
 "AREA DE PROJECAO: 120,00 m2",
 "AREA PERMEAVEL: 90,00 m2",
 "AREA CONSTRUIDA COMPUTAVEL: 180,00 m2",
 ].forEach((v,i)=>{const yy=256+i*82;text(648,yy,v,11,true);doc.setDrawColor(221,230,238);doc.line(644,yy+16,1120,yy+16);});
 doc.setFillColor(224,242,252);doc.roundedRect(642,574,481,126,10,10,"F");
 text(660,604,"CONFERENCIA ARITMETICA - NAO LEGAL",12,true);
 text(660,632,"OCUPACAO: 120 / 300 = 40%",11);
 text(660,655,"PERMEABILIDADE: 90 / 300 = 30%",11);
 text(660,678,"C.A.: 180 / 300 = 0,60",11);
 const bytes=doc.output("arraybuffer");
 return new File([bytes],"SIGAPRO_QA_Projeto_Ficticio_Processo_000004_2026.pdf",{type:"application/pdf"});
}
