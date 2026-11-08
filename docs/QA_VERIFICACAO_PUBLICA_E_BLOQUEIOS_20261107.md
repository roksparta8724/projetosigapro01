# SIGAPRO — auditoria de superfície pública e bloqueios remanescentes

**Data:** 07/11/2026, operação restrita à branch de homologação `fix/qa-triagem-analise-pagamento-20261101`; PR #118 DRAFT. **Não é certificado de operação municipal.**

## Evidências verificadas em sistemas reais

- **GitHub:** último SHA da PR consultado `75860aef52164b57097861230d105efd14162ec2`, com Quality Gate, Neon migration validation e OCR isolado **SUCCESS**. Os commits posteriores deste relatório/correção exigem verificação própria.
- **Vercel:** alias de homologação `projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app` **READY**, deployment `dpl_GG2KpFyB2ZM8pjXpyky85kdKeXAU`, SHA publicado `2d2bae05d5d22cd4ea6f6f71c1f2a389426e0979`.
- **GET /acesso:** HTTP 200 com HTML PT-BR do portal institucional. Não comprova login autenticado, renderização visual no navegador nem tempo P95.
- **GET /api/mp-qa-webhook:** HTTP 200, `environment=qa`, `configured=true`, `workerConfigured=true`, `encryptionConfigured=true`, política de evento bancário assinado e PDF original. **Prova configuração e disponibilidade da rota, não baixa real de dinheiro.**
- **GET /api/health (antes desta correção):** HTTP 200, com inventário público detalhado de quais fornecedores/segredos estavam configurados. Na implantação consultada, chaves Neon/R2 foram detectadas; `hasOpenAiApiKey=false`. Isso NÃO prova que todos os motores de IA estejam ausentes, mas confirma a ausência dessa variável específica naquele Preview. Não ler ou divulgar valores.
- **Vercel Runtime Errors/logs:** consulta de 30 minutos não retornou erros agregados e não encontrou logs de erro no deployment. Isso não demonstra ausência de falhas de navegador nem disponibilidade durante períodos anteriores.

## Endurecimento aplicado no código (ainda depende de novo Preview)

No arquivo `api/storage-connection.ts`, o `GET /api/health` público passa a responder apenas **liveness** (`ok=true, service=sigapro, status=alive`), sem revelar estrutura/credenciais de banco, R2, provedor de IA ou buckets. A resposta HTTP recebe `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

O teste `src/test/publicHealthDisclosureQa.test.ts` impede que o endpoint público volte a divulgar o inventário e garante que os caminhos de gestão do armazenamento continuem atrás dos procedimentos de autorização existentes. O endpoint de webhook QA conserva seu status de configuração, sem expor nenhum segredo. **A alteração de código não estará no Preview até deploy READY com SHA correspondente.**

## Bloqueios ainda efetivos e ações corretas

1. **Webhook Mercado Pago:** rota QA e credenciais de worker presentes, mas falta notificação real assinada de teste com ordem/acreditação confirmada pelo provedor, reenvio e conciliação bancária `pending→paid`, PDF original e evidência de evento. Nenhum assistente deve fabricar crédito ou assinar evento como se viesse do Mercado Pago.
2. **Conta técnica legada da QA:** `sigapro_prod_webhook_worker` tem `BYPASSRLS` e herança `neon_superuser` nessa branch. A execução de `ALTER ROLE`/revogação foi negada por SQLSTATE 42501, falta de `CREATEROLE` e `ADMIN OPTION`, e foi revertida. A conta dedicada **`sigapro_qa_webhook_worker`** permanece separada e restrita; o webhook novo fixa a identidade desta conta, não a legada. Remoção do legado exige administração Neon; não apagar o papel ou tentar bypass de permissões.
3. **Produção:** `officialize_preprotocol_v1` continua com EXECUTE público no Neon produtivo. O procedimento seguro de QA e backup já foi testado, mas falta aprovação formal de janela e implantação produtiva controlada. **Não mudar dados/ACL de produção enquanto outros critérios de aceite estiverem pendentes.**
4. **IA:** automatização OCR isolada passou testes, mas ainda é necessário demonstrar leitura integral de planta real com recuos, localização e matriz legal conferida com profissional e páginas originais. Ausência de `OPENAI_API_KEY` em Preview é um dado de configuração, não solução substituível por valores fabricados.
5. **R2/Neon:** presença de variáveis e de metadados SHA não equivale a arquivo real recuperável nem a ensaio de restauração. Requer leitura autenticada do PDF original, hash de bytes e recuperação integral em ambiente de cópia.
6. **UX/login e isolamento:** testes de unidade e sessão SQL não substituem contas reais em dois municípios, capturas de quatro dashboards, P50/P95, teste de login/logout e conferência visual de responsividade.
7. **Aceite comercial:** `docs/QA_COMMERCIAL_ACCEPTANCE.json` ainda registra **10/10 pending**. O verificador privado exige artefatos concretos e SHA imutável; não alterar artificialmente os status.

**Conclusão:** código QA com avanços verificáveis e webhook de sandbox instalado, mas o sistema não pode ser anunciado como integralmente homologado e liberado para atos oficiais sem evidências de banco, IA, PDFs e recuperação. Proteger a superfície pública e continuar testes de funcionamento sem comprometer dados nem conceder privilégios excessivos.
