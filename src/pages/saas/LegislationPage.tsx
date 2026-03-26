import { ExternalLink, Landmark, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function LegislationPage() {
  const { session } = usePlatformSession();
  const { scopeId, institutionSettingsCompat } = useMunicipality();
  const { getInstitutionSettings } = usePlatformData();
  const settings = institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);

  const items = [
    {
      title: "Plano Diretor",
      detail: settings?.resumoPlanoDiretor || "Não Configurado",
      fileName: settings?.planoDiretorArquivoNome,
      fileUrl: settings?.planoDiretorArquivoUrl,
    },
    {
      title: "Lei de Uso e Ocupação do Solo",
      detail: settings?.resumoUsoSolo || "Não Configurado",
      fileName: settings?.usoSoloArquivoNome,
      fileUrl: settings?.usoSoloArquivoUrl,
    },
    {
      title: "Leis Complementares",
      detail: settings?.leisComplementares || "Não Configurado",
      fileName: settings?.leisArquivoNome,
      fileUrl: settings?.leisArquivoUrl,
    },
  ];

  return (
    <PortalFrame eyebrow="Legislação Urbanística" title="Plano Diretor e Uso do Solo">
      <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
        <Card className="rounded-[28px] border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <Landmark className="h-5 w-5" />
              Base Municipal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[14px] leading-6 text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">A pasta de legislação fica disponível para protocolo, análise e acompanhamento externo.</div>
            <div className="rounded-2xl bg-slate-50 p-4">As alterações realizadas pelo master ou pela prefeitura são refletidas automaticamente nas áreas do sistema.</div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <ScrollText className="h-5 w-5" />
              Consulta Institucional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item) => (
              <div key={item.title} className="rounded-[24px] border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-2 text-[14px] leading-6 text-slate-600">{item.detail}</p>
                    {item.fileName ? <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">{item.fileName}</p> : null}
                  </div>
                  {item.fileUrl ? (
                    <a href={item.fileUrl} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">
                      <ExternalLink className="h-4 w-4" />
                    </div>
                  )}
                </div>
                {item.fileUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <iframe src={item.fileUrl} title={item.title} className="h-72 w-full" />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PortalFrame>
  );
}
