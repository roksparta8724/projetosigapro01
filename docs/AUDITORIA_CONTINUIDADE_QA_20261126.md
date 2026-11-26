# Auditoria de continuidade SIGAPRO — 26/11/2026 (somente QA)

Base oficial preservada: `4218337af504bd5c4a92ef6e50c947ce24f4b528`.
Trabalho acumulado na branch existente `fix/homologacao-geral-sei-dashboard-bank-20261113`.
Não autoriza merge, produção, alteração de credenciais ou pagamento real.

## Diagnóstico medido no banco isolado
- 8 processos, 11 guias, 1 alvará de aprovação com status signed e 1 habite-se emitido.
- 1 guia com referência de PDF original + SHA; 2 vinculadas a pagamento bancário; 1 com autenticação bancária. 8 registros com indicação de pagamento sem timestamp de autenticação bancária (inclui fixtures/legado; não é prova de irregularidade financeira).
- Uma conexão Mercado Pago TEST ativa, último teste ok; nenhum webhook registrado.
- Dez critérios de aceite comercial permanecem pendentes no manifesto público. Status de processo e CI não substituem teste autenticado E2E.

## Correção de arquivos desta rodada
O upload multipart de legislação não condicionava a conclusão do objeto à ausência de revisão concorrente; e o retry de legislação/anexos comuns confiava em HEAD/metadados. Agora a conclusão de legislação usa IfNoneMatch, e anexos comuns e legislação grandes são relidos por streaming com limite, tamanho, MIME e SHA reais antes de responder sucesso (inclusive retry). O navegador exige confirmação de hash e tamanho pelo servidor; não persiste seu próprio hash como prova de upload. A guarda DAM original específica permanece. Testes unitários com streams sintéticos e testes de integração mockada; não são prova física de R2.
A proteção por ambiente de R2 ainda precisa de demonstração independente: as credenciais de Preview e produção foram descritas como compartilhadas na auditoria anterior. Não alterar buckets ou segredos nem escrever documentos reais até confirmar segregação; a correção de bytes não equivale a isolamento físico.

## Pendências por frente
1. Fluxo aprovação/habite-se: jornada autenticada nova, todos os perfis, guias, transições, comunique-se, assinatura, emissão e arquivo.
2. Financeiro: sandbox webhook assinado com idempotência e estorno, segregação do worker, original PDF real preservado; convênio/credenciais e autorização municipal para operação real.
3. Documentos: segregação física de R2, recuperação por teste controlado, PDFs legados sem prova (não fabricar ou sobrescrever); rota direta de legislação legada ainda requer auditoria separada.
4. Legislação/IA: norma vigente e gabarito humano, GIS oficial, leitura real, infraestrutura de IA; não ativar regra não conferida.
5. Certificação GOV.BR/ICP: callback, identidade/CPF, PAdES, guarda imutável, credenciais e homologação oficial. Infraestrutura parcial não autoriza emissão.
6. UX/segurança: jornada autenticada de todos os perfis, duas prefeituras, mobile e temas; medições de desempenho e recuperação Neon/R2.
7. Revisão humana das dez provas privadas vinculadas ao SHA final; produção somente por nova autorização expressa.
