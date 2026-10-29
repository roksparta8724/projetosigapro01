# Proteção de guias históricas antes de publicar SIGAPRO
**Base de referência:** consultas de leitura em 26/10/2026. **Esta auditoria não autoriza publicação ou alterações financeiras.**

## Controle reproduzível (não modifica dados)
Executar `scripts/production-legacy-guide-inventory.sql` nas branches Neon usando os **IDs explícitos**.
A base de dados tem o mesmo nome na produção e no QA; o nome retornado por `current_database()` não identifica a branch.

- Produção: `br-summer-surf-b4s88rv5`.
- QA isolado: `br-solitary-sound-b4xlbvs6`.
- Saída agregada somente. Nenhum CPF, nome ou número de guia deve entrar nos logs públicos.

## Diagnóstico inicial — produção
- **6 registros com situação de quitação/confirmado**: 5 com `paid=true`; 1 com `status=confirmed` e `paid=false`.
- **5** têm vínculo de processo e prefeitura; **1** não tem esses vínculos.
- O novo formato `original_pdf_key` ainda não existe na produção, e **nenhum dos 6** possui documento PDF histórico diretamente identificado por número de guia entre os anexos catalogados em `process_documents`.
- 4 dos 6 possuem outros documentos PDF do processo, mas **não é permitido inferir que sejam boletos oficiais**.
- `payment_guides` tem dados históricos; não remover, regenerar, substituir data de emissão, mexer em identificadores de banco, reemitir ou recalcular.

## Requisitos para reconciliação manual, não automática
1. Preservar um snapshot somente de leitura dos IDs, município, vínculo, status, valores e datas por canal restrito do Financeiro, sem expor dados pessoais em CI.
2. Registrar no histórico o motivo da divergência de `status` e `paid`, com prova bancária, **antes** de qualquer eventual correção de cadastro; nunca inferir quitação de um único campo.
3. Identificar o arquivo original realmente emitido: obter uma cópia autenticada do provedor/banco ou do arquivo municipal preexistente e confrontar sua identidade, data, guia e banco.
4. Se não houver prova documental, **não fabricar nem arquivar um PDF com data retroativa**. A interface deve reportar indisponibilidade histórica, sem reemitir automaticamente guias quitadas.
5. Revisar individualmente os scripts de migração e executar cópias/ensaios em staging segregado; toda modificação em produção exige autorização expressa e rollback documentado.
6. Testar com usuários reais autorizados em QA os dois fluxos municipais, abertura/reabertura de PDF, conciliação com provedor sandbox, assinaturas, rascunhos, permissões e isolamento entre prefeituras.
7. Voltar a executar o inventário na branch correta após cada etapa; `RELEASE_RECONCILIATION_REQUIRED` impede a homologação definitiva.

## O que NÃO foi feito
Nenhuma migração, escrita ou cobrança na produção. A operação SQL de inventário é um SELECT agregado. A QA recebeu apenas scripts de testes para automatizar o alerta sem tocar os seis registros oficiais.
