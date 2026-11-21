# SIGAPRO QA — execução real, única, da alternativa textual Cloudflare

Motivo: a conversão PDF via Cloudflare toMarkdown foi recusada, enquanto o PDF de teste possui texto selecionável em todas as três páginas.

O SIGAPRO agora deve extrair o texto no próprio servidor, conservar a ordenação de páginas e solicitar interpretação textual, **sem enviar o PDF inteiro ao conversor**. Este commit ativa uma única chamada de teste ao Workers AI usando o PDF sintético QA04 que já se encontra no R2.

Critérios técnicos: toda citação deve estar contida na página real; recuos **não** são tratados como geometria conferida; a IA não muda nenhum processo ou parâmetro legal; a resposta não representa conformidade urbanística.

Se o serviço de interpretação devolver erro de credencial, saldo ou modelo, a build QA deve falhar e registrar apenas o código de falha. Não repetir sem mudança de causa. Nenhum dado de cliente ou segredo é publicado.
