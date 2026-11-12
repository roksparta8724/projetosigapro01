import { CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID } from "@/lib/urbanOfficialLegalSources";
import { LC379_QUADRO_II_SHA } from "@/lib/urbanQuadroIIPdfAssistedPrefill";

type UnitType = "UH-UI" | "UH-UG" | "UH-MS" | "UH-MV";
const unitTypes: {code: UnitType;label: string}[] = [
  {code:"UH-UI",label:"Unifamiliar isolada"},
  {code:"UH-UG",label:"Unifamiliar agrupada"},
  {code:"UH-MS",label:"Multifamiliar superposta"},
  {code:"UH-MV",label:"Multifamiliar em apartamentos"},
];

const rows: {modality:string; allowed:UnitType[]; parking:Partial<Record<UnitType,string>>}[] = [
  {modality:"Loteamento",allowed:["UH-UI","UH-MV"],
    parking:{"UH-UI":"1 vaga por unidade habitacional (1:UH)",
      "UH-MV":"1 vaga por UH + 30% das UH como estacionamento coletivo mínimo"}},
  {modality:"Condomínio horizontal",allowed:["UH-UI","UH-UG","UH-MS"],
    parking:{"UH-UI":"1:UH e estacionamento coletivo",
      "UH-UG":"1:UH e estacionamento coletivo",
      "UH-MS":"1:UH e estacionamento coletivo"}},
  {modality:"Vila",allowed:["UH-UI","UH-UG","UH-MS"],
    parking:{"UH-UI":"1:UH e estacionamento coletivo",
      "UH-UG":"1:UH e estacionamento coletivo",
      "UH-MS":"1:UH e estacionamento coletivo"}},
];

/** PDF evidence preview ONLY. This deliberately creates no legal/rule writes. */
export function UrbanParcelamentoPage51Panel({
  municipalityId, documentSha256,
}: {municipalityId:string;documentSha256:string}) {
  if (municipalityId !== CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID ||
      documentSha256 !== LC379_QUADRO_II_SHA) return (
    <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
      Modalidades habitacionais devem ser transcritas de documento vinculado e conferido
      pela própria prefeitura. Nenhum parâmetro foi importado automaticamente.
    </p>
  );
  return (
    <section data-sigapro-page51-parcelamento-matrix="true"
      className="rounded-2xl border border-amber-300 bg-white p-4 text-slate-900">
      <h4 className="text-sm font-extrabold">Página 51 — modalidades de parcelamento do solo</h4>
      <p className="mt-2 text-xs leading-5 text-slate-700">
        Quadro separado das categorias E/I/S/C. Esta é uma transcrição assistida do PDF
        original da LC 379/2009, página 51: ainda sem conferência de vigência,
        alterações legais ou aprovação municipal. Não é norma ativa nem parecer da IA.
      </p>
      <div className="mt-3 max-w-full overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[690px] border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-slate-950">
            <tr><th className="px-3 py-2">Modalidade</th>
              {unitTypes.map(u=><th key={u.code} className="px-3 py-2">
                {u.code}<span className="block font-normal">{u.label}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row=>(
              <tr key={row.modality} className="border-t border-slate-200 align-top">
                <th scope="row" className="px-3 py-3 font-semibold">{row.modality}</th>
                {unitTypes.map(unit=>{
                  const applicable=row.allowed.includes(unit.code);
                  return <td key={unit.code} className="px-3 py-3 leading-5">
                    <span className={applicable ? "font-bold text-slate-900" : "text-slate-500"}>
                      {applicable ? "X impresso no PDF" : "Célula sem marcação"}
                    </span>
                    {applicable && row.parking[unit.code] ? (
                      <p className="mt-1 text-slate-700">{row.parking[unit.code]}</p>
                    ) : null}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="note" className="mt-3 text-xs font-semibold leading-5 text-amber-900">
        A marcação X e as células vazias não são, por si sós, autorização ou proibição.
        As expressões de estacionamento coletivo carecem de revisão da legislação
        consolidada. Não cadastrar UH como categoria comercial do Quadro II.
      </p>
    </section>
  );
}
