# SIGAPRO — QA PIX original imutável (28/10/2026)

Somente **Neon branch QA** `br-solitary-sound-b4xlbvs6`, **GitHub branch** `qa/sigapro-ia-logo-integrado-20261023`. **NÃO LIBERADO PARA PRODUÇÃO.**

## Objetivo
Após emissão prévia de uma ordem PIX de teste (jamais criar outra cobrança), um usuário autenticado poderá clicar **Visualizar guia**. O sistema deve:
1. Reabrir o original arquivado, se houver, sem reemitir, reprocessar ou atualizar o documento.
2. Se ainda não houver original, buscar a ordem já comprovada na tabela isolada `mp_qa_pix_orders_v1`.
3. Vincular a mesma ordem e PIX à guia, via `qa_mp_pix_bind_to_guide_v1`, exigindo município, processo, valor, ambiente test, status não pago e credenciais sandbox ativas. Não atualizar `paid` nem `status`.
4. Congelar snapshot financeiro canônico, renderizar PDF A4, obter SHA-256, gravar no **Neon QA Storage**, anexar chave e SHA à guia e reabrir o mesmo PDF com validação dos bytes no endpoint isolado.
5. Se qualquer etapa falhar, a UI informa erro; não regenerar guias pagas nem representar mera visualização como original arquivado.

## Implantação
- Revisar/aplicar **somente no Neon QA**: `neon/migrations/20261028_qa_pix_bind_to_guide_for_original_v1.sql`.
- A função é `SECURITY DEFINER` e concede execução apenas a `authenticated`; bloqueia guias sem comprovação no ledger QA, já pagas, de outro município, ou de sistema municipal próprio.
- Publicar **uma única versão** em QA após TypeScript, testes, build e validação das migrações, nunca na main.
- Em QA, **sem novo pagamento**: abrir `DAM-PRE-QA-20261028-PIXHMLG2`, entrar novamente, abrir de novo; comparar `original_pdf_key`, `original_pdf_sha256`, `bank_reference`, `pix_code`, `paid=false` e `status=pendente`. O mesmo PDF deve reabrir, inclusive após F5 e mudança de sessão autorizada.
- Conferir com PDF real em mais de um perfil e negar acesso de outra prefeitura. Esses são testes manuais autenticados, não substituídos por unit tests.

## Consulta de validação (somente leitura; branch QA)
```sql
SELECT guide_number,amount,status,paid,
       (original_pdf_key IS NOT NULL AND original_pdf_sha256 IS NOT NULL) AS original_saved,
       (document_snapshot IS NOT NULL) AS document_frozen,
       bank_reference IS NOT NULL AS provider_order_bound,
       provider_environment, payment_provider
FROM public.payment_guides
WHERE guide_number='DAM-PRE-QA-20261028-PIXHMLG2';
```

## Condições bloqueadoras de produção
Nenhum webhook validado e conciliado foi comprovado para essa ordem. Nenhuma cobrança fictícia pode dar baixa real. Se a produção apresentar guias históricas quitadas sem PDF original, não gerar PDF retroativo. Os fluxos de Aprovação, Habite-se, IA e permissões entre duas prefeituras ainda exigem aceite autenticado. **A autorização para migrar/promover produção é independente.**

Rollback QA (antes de manter documentos novos vinculados): retirar o novo código da QA branch e, se necessário, `DROP FUNCTION public.qa_mp_pix_bind_to_guide_v1(uuid,text,text)` na mesma branch isolada. Nunca apagar PDFs originais, pagamentos ou processos para simular rollback.
