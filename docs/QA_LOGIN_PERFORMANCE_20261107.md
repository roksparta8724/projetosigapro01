# SIGAPRO — correção estrutural do acesso lento e prevenção de regressões
**Data-base:** 07/11/2026 · **Escopo:** branch `fix/qa-triagem-analise-pagamento-20261101`, PR #118, exclusivamente QA.

## 1. Causas reproduzidas no código anterior

1. **JavaScript de entrada excessivo:** `src/App.tsx` importava sincronicamente 40 páginas, incluindo 32 telas internas (dashboards com gráficos, análise, pagamentos e PDF). Mesmo visitantes que só precisavam de `/acesso` recebiam o custo do código das áreas autenticadas.
2. **Entrada amarrada à operação inteira:** `AcessoPage.tsx` esperava `usePlatformData().dataReadyForCurrentUser` e `usePlanEntitlements().isResolving`. O carregador `loadRemotePlatformStore` aguardava, via `Promise.all`, aproximadamente 31 consultas de tabelas/RPCs operacionais, mesmo após o Neon Auth e o perfil terem sido confirmados.
3. **Diagnósticos enganosos de saída:** o `Promise.race` do logout deixava um `setTimeout` disparar após conclusão normal da chamada de logout; limpeza de chaves locais podia não acontecer se a revogação remota lançasse erro.
4. **Credenciais de demonstração no código:** a tela de login incluía valores padrão de e-mail e senha de teste para desenvolvimento. Esses valores foram removidos; se foram reutilizados em qualquer conta verdadeira, a senha precisa ser rotacionada pelo responsável autorizado.

## 2. Correções no código

- **Divisão por rota:** 32 componentes de páginas internas importados por `React.lazy` no nível do módulo em `src/App.tsx`; a árvore de rotas permanece protegida por `PermissionRoute` e `PlanModuleRoute`. Páginas públicas importantes, inclusive `AcessoPage`, continuam carregadas diretamente. Não criar `lazy()` dentro de render para não remontar dashboards.
- **Nova verificação de entrada:** `src/lib/loginLandingAccess.ts` decide rota por perfil já validado pelo Neon e, para papéis municipais e externos, confirma via RPC oficial a associação ativa ao município `has_tenant_access` e o módulo/contrato `assert_municipality_entitlement_v1`. O login não usa cache de plano para decidir autorização; casos de município ausente, vínculo incorreto, módulo não contratado e falha de RPC são negados. Master já depende da validação canônica do perfil, sem consulta municipal extra.
- **Prefetch específico:** durante a verificação dos direitos de entrada, baixa o módulo da página de destino específico do papel; não baixa previamente as outras 31 páginas. O painel operacional poderá carregar dados após a navegação e cada API mantém autorização própria.
- **Tratamento de saída:** o timeout de logout é limpo no `finally` e o cache local é eliminado mesmo se a chamada de revogação remota falhar. Nenhum token deve ser incluído em logs.
- **Sem e-mail ou senha fixos:** campos iniciam vazios em qualquer ambiente.

## 3. Evidências técnicas (não são tempo real de login)

| Indicador medido no build CI | Antes | Após a correção |
|---|---:|---:|
| `dist/assets/index-*.js` (gzip do build Vite) | **1.250,43 KB** | **514,90 KB** |
| Arquivo principal JS sem compressão | 4.596,38 KB | 1.804,50 KB |
| Redução aproximada do arquivo principal gzip | — | **58,8%** |
| Testes de regressão na versão de código aprovada `4fc60bc...` | — | **1.538 testes / 272 arquivos** |

O resultado veio de logs reais do GitHub Actions dos SHAs `23d47c939ff18a29113a36fd6d68eca1215042b8` e `4fc60bc2022dcf0edaf1ec16c41ea2c649937bdf`, não de estimativa visual. **Tamanho do bundle não equivale a tempo de login.** É necessário testar tempo até form first paint, credencial validada, primeira rota e dados do dashboard em rede/dispositivo real.

## 4. Regressão automática exigida no Quality Gate

- `src/test/loginFastAccessGateQa.test.ts`: papéis Master, Prefeitura, supervisor, analista, fiscal, financeiro, protocolo, profissional e proprietário; vínculo municipal, limite de função contratada, conta errada, falha de servidor, import lazy e ausência de credencial hardcoded.
- `src/test/loginRemoteStoreRegression.test.ts`: mantém isolamento de dados entre usuários, mas não exige carregar todos os processos para concluir a fase de entrada.
- `scripts/qa-login-bundle-budget.mjs`: mede **o arquivo real gerado pelo Vite** e rejeita JavaScript inicial acima de **750 KiB gzip**; protegendo contra novos imports massivos. `scripts/qa-login-bundle-budget.test.mjs` testa limites, scripts indevidos, entry duplicado e path.
- `.github/workflows/quality-gate.yml`: executa o teste do orçamento e a análise do build após `npm run build`. É uma verificação anti-regressão, não uma certificação de performance.

## 5. Restrições e próximos ensaios obrigatórios

- Fazer login e logout no navegador em QA com **Master, Admin prefeitura, analista, financeiro, profissional externo e proprietário**. Conferir subdomínio correto, troca de usuários, 401/403, refresh F5 e reset de senha.
- Medir **P50/P95** do carregamento da página pública, autenticação, entrada no dashboard e hidratação operacional, usando rede e ambiente equivalentes ao uso municipal. Ainda não foram medidos e nenhum SLA está declarado.
- Verificar se `PlanModuleRoute` ainda exibe um instante vazio enquanto o store/contrato integral chega. O novo gate confirma os direitos no login, mas as páginas internas conservam validações de contrato próprias; **não confundir a redução do tempo de entrada com a conclusão de todos os carregamentos**.
- O store operacional ainda agrega dezenas de consultas em paralelo. Dimensionar paginação, queries seletivas, RPC de visão resumida por perfil, cache de dados não sensíveis e observabilidade. Nunca usar cache local como autorização ou exibir informação de outro município.
- Se a Vercel retornar HTTP 402 `api-deployments-free-per-day`, **não alegar publicação**. CI aprovado e commit no GitHub não significam que o alias QA foi atualizado. A conta atual está em Hobby; qualquer uso comercial exige avaliar plano de infraestrutura compatível, sem contratação automática.
- **Não estão homologados por esta correção:** 10 critérios do manifesto `docs/QA_COMMERCIAL_ACCEPTANCE.json`, incluindo IA com planta real, pagamentos reais sandbox, isolamento entre duas prefeituras e restauração Neon/R2. `main` e banco de produção permanecem intocados.

**Política:** não registrar dados pessoais, credenciais, tokens, cookies ou capturas de sessão em logs ou commits. Nunca promover este lote para produção sem aceite independente.
