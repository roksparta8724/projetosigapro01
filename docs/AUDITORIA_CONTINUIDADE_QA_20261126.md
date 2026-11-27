# Auditoria de continuidade SIGAPRO — 26/11/2026 (somente QA)

Base oficial preservada: `4218337af504bd5c4a92ef6e50c947ce24f4b528`.
Trabalho acumulado na branch existente `fix/homologacao-geral-sei-dashboard-bank-20261113`.
Não autoriza merge, produção, alteração de credenciais ou pagamento real.

## Diagnóstico medido no banco isolado
- 8 processos, 11 guias, 1 alvará de aprovação com status signed e 1 habite-se emitido.
- 1 guia com referência de PDF original + SHA; 2 vinculadas a pagamento bancário; 1 com autenticação bancária. 8 registros com indicação de pagamento sem timestamp de autenticação bancária (inclui fixtures/legado; não é prova de irregularidade financeira).
- Uma conexão Mercado Pago TEST ativa, último teste ok; nenhum webhook na tabela genérica. A tabela específica Mercado Pago contém 2 eventos assinados, 1 evidência de baixa consistente com a guia e SHA registrado; ainda não comprova nova jornada ponta a ponta nem objeto físico.
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

## Conciliação de eventos repetidos
O ingest QA podia substituir a observação que sustentava uma baixa já registrada por um estado não associado. A migração preserva a observação creditada e seu vínculo, serializa a atualização do recebimento existente e recusa reuso do mesmo request com hash divergente. A nova observação incompatível é devolvida para revisão, sem alterar o crédito anterior. Comparação exata de valor; não implica estorno automático. Migração somente em QA.

## Ensaio lógico executado em 26/11 (ciclo de aprovação)
O ensaio anterior falhava por omitir o SHA exigido pelo banco. Atualizado para calcular hash de bytes fictícios em subtransação revertida. Resultado: 18 etapas registradas, todas concluídas, rollback verificado. Inclui quatro anexos obrigatórios, triagem automática somente após o quarto, análise, reabertura de documento, comunique-se (criação, resposta e conclusão), recusa de financeiro e de analista de outro município, rascunho de alvará e rejeição de assinatura fictícia. A migração restringe exigências técnicas à equipe competente, bloqueia mutações em processo encerrado e serializa resposta/conclusão. Não equivale a upload R2, login pelo browser ou emissão real assinada.

## Habite-se: bloqueio corrigido e conclusão testada
O ensaio real de RPC inicialmente falhou: formulário legado correspondia à ficha anterior (v1), enquanto o diretor assinou v2 com observações distintas. O diretor e instante da assinatura coincidem com a emissão. A nova migração resolve a versão única correspondente à emissão, exige identidade, instante, hash, escopo, reautenticação e evidência v4; leitura, reconsulta e conclusão usam essa versão. Nova emissão continua exigindo igualdade com rascunho. Conclusão em QA passou, segunda chamada idempotente, um movimento, formulário e assinatura preservados e rollback verificado. Não é uma nova vistoria/assinatura real nem comprova PDF físico.

## Privacidade do histórico externo
Quatro políticas de leitura agora exigem acesso ao processo e respeitam a visibilidade interna/externa de exigências, auditoria, movimentações e despachos. Ensaio executado com SET LOCAL ROLE authenticated e claims de perfis QA: analista visualiza ambas as exigências; profissional vinculado visualiza só a compartilhada, sem histórico interno; movimentações públicas permanecem acessíveis. Fixtures e efeitos de teste revertidos. Não equivale a auditoria integral de LGPD.

## Arrecadação: proteção do recebimento de produção validada em QA
A rotina de produção agora preserva recebimento que já sustenta crédito, recusa alteração de hash/referência e limita a baixa a guias pendentes. Retorno incompatível após crédito gera revisão interna deduplicada, sem desfazer guia ou alvará. Ensaio SQL em QA com guia sintética e conexão de provedor simulada somente dentro de subtransação: cancelada recusada, pendente compensada, reenvio idempotente, dois retornos de estorno geraram uma revisão, recebimento original intacto, hash divergente recusado. Rollback confirmado, sem evento externo ou dinheiro. Não implementa estorno bancário automático.

## Recuperação
Neon informa janela de histórico de 21600 segundos (6 h). Tentativa de snapshot da branch QA recusada (HTTP 400: non-root branch). Nenhuma restauração ou alteração na raiz de produção foi realizada. Cópias antigas existentes não comprovam recuperação atual. A prova de recuperação permanece aberta.

A tentativa de criar cópia temporária da QA também foi recusada por limite de branches (HTTP 422). Nenhuma cópia foi criada, nenhuma branch removida. Logs da preview 3625b0b: worker bancário PASS_LEAST_PRIVILEGE_REAL_CONNECTION; R2 original NOT_VERIFIED_ORIGINAL_OBJECT_MISSING; documento artificial INTEGRITY_MISMATCH; provedor visual CONFIGURED_NOT_PROVEN. A busca do PDF exato agora pode executar separadamente em modo somente leitura; restauração requer bucket QA dedicado explicitamente autorizado e comprovação dos bytes. Não executar escrita em bucket compartilhado, nem reconstruir guia histórica.

## 27/11 — cobrança assinada e teste de integração sem escrita
A rotina v2 não registrava provider_charge_saved_at, embora o conciliador exigisse essa prova. Corrigidas as quatro rotinas de autorização/persistência, com estado pendente obrigatório, rechecagem sob lock, timestamp preservado em retry e proteção server-side. Ensaio na QA com HMAC existente, sem revelar chave nem chamar banco: guia cancelada recusada, cobrança sintética assinada gravada com timestamp, repetição sem alterar timestamp, rollback confirmado. O build anterior está READY e aprovou Quality Gate e migrações; busca real do DAM retornou EXACT_SHA_SOURCE_NOT_FOUND. Nova prova isolada usa somente GET do provedor bancário e uma inferência sobre PDF artificial, sem escrever no R2 nem emitir cobrança. Leitura local do fixture independente do PDF histórico.

## Evidência da preview fae54b1 (27/11)
Quality Gate e migrações aprovados, Vercel READY. Consulta real sandbox do banco confirmou boleto (PASS_BOLETO_GET); PIX não comprovado. Leitura nativa do projeto fictício gerado confirmou três medidas; visual externo NOT_VERIFIED_CONFIG. Não há nova escrita de R2. Novo código ICP: pré-validação de CPF pessoa física em DER, combinada com CMS e CRL, sem ativar emissão e sem pressupor equivalência GOV.BR.

O diagnóstico de configuração agora respeita política local_only e diferencia bloqueio deliberado de credencial ausente. Não altera a política vigente nem envia documento quando a leitura externa está proibida.

Orquestração de candidato ICP em sandbox adicionada, com testes de sessão repetida, escopo municipal, bytes, identidade e competência revogada. Não expõe rota ou altera processo oficial. A etapa de emissão continua bloqueada até validação PAdES e conexão dos adaptadores de persistência/credenciamento.

## Integração de armazenamento municipal (27/11)
A tabela e RPCs BYOS estavam ausentes em ambos os bancos Neon (consultas somente leitura no oficial). Migração nova em QA cria o contrato v2, sem alterar repositório ativo. Operações do servidor têm MAC vinculado a município, ação, payload e tempo, usando domínio derivado do segredo de atestação já instalado; credenciais cifradas AES-GCM com AAD de município e endpoint, domínio de criptografia separado. Segredo raiz exige rotação controlada. R2 e AWS S3 oficiais são os endpoints permitidos inicialmente; sem endereços arbitrários. Ativação antes do primeiro processo; troca de repositório com acervo existente bloqueada até migração comprovada. Legislação pública permanece em R2 institucional. Teste inclui PUT condicional, GET com SHA real, DELETE e HEAD 404; falha de limpeza não é sucesso. Nenhum objeto físico nem configuração municipal foi alterado neste ensaio SQL; testes de rede simulados, configuração externa real ainda depende de credenciais.
