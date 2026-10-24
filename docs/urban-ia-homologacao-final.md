# SIGAPRO IA Urbanismo — roteiro de homologação integral

**Ambiente obrigatório:** branch de QA `qa/sigapro-ia-logo-integrado-20261023` e banco isolado `sigapro_migration_stage_20260923`. Este documento **não autoriza deploy**, escrita no banco oficial ou alteração de processos preexistentes.

## Portões de liberação (todos obrigatórios)
1. **CI:** Quality Gate e Neon migration validation verdes **no mesmo SHA final**. Não aceitar resultados de commit anterior.
2. **DB:** executar `scripts/urban-neon-operational-gate.sql` e `scripts/urban-neon-public-permissions-gate.sql`; exigir `database_gate=OK`, `rpc_gate=OK`, `rls_gate=OK`, `exposed_to_public=0`.
3. **Aceitação SQL:** executar `scripts/urban-neon-integrated-acceptance.sql` SOMENTE no banco isolado. A simulação JWT comprova regras SQL, **não** substitui autenticação real.
4. **Dados controlados:** criar por vias normais da aplicação uma legislação marcada **FICTÍCIA / QA / SEM VALIDADE LEGAL**, evidência de prancha sintética e dois processos fictícios distintos, um por prefeitura, com perfis de teste autorizados. Não reciclar nem modificar processos reais. Validar dados com o portão operacional.
5. **Navegador autenticado:** percorrer os cenários abaixo com autenticação real, preservar capturas e logs sem segredos/CPF de pessoas reais.
6. **Auditoria humana:** analista e direção verificam a minuta; nunca promover pré-conferência consultiva automaticamente para parecer, despacho ou aprovação.
7. **Entrega:** somente após gates verdes, revisão de diferenças, migrações e autorização explícita publicar; repetir testes de fumaça no ambiente aprovado.

## Matriz funcional mínima

| ID | Perfil / cenário | Ação | Aceite verificável |
|---|---|---|---|
| U01 | Administrador municipal A | Cadastrar rascunho de regra de zona/uso com referência, data e parâmetros | Rascunho persistido na prefeitura A; não aparece na B |
| U02 | Administrador autorizado A | Ativar versão legal após revisão | Nova versão ativa, versão e vigência corretas; histórico preservado |
| U03 | Analista responsável A | Abrir processo QA e selecionar zona/uso/data | Mostra somente a norma A válida nessa data |
| U04 | Analista A | Abrir prancha sintética; inserir medição comprovada com página | Limites comparados e evidência identificável no resultado |
| U05 | Analista A | Inserir medição ausente, negativa, sem prancha ou não inteira para pavimentos | Erro compreensível; botão Registrar não envia valor inválido |
| U06 | Analista A | Conferir condição legal e evidência vinculada | Revisão humana explícita e minuta identificada como interna |
| U07 | Analista A | Registrar uma pré-conferência | Uma entrada auditável com processo, prefeitura, revisor, norma, data e evidências |
| U08 | Analista A | Atualizar página e recuperar histórico | Registro continua visível sem recomputar/sobrescrever evidência histórica |
| U09 | Analista A | Fazer duplo clique em Registrar com rede lenta | Não cria registros duplicados na mesma interação |
| U10 | Analista A | Trocar processo ou prefeitura durante carregamento/gravação | Nenhuma resposta antiga aparece no novo contexto |
| U11 | Analista A | Simular falha na consulta de histórico | Mensagem de indisponibilidade, nunca 'histórico vazio' |
| U12 | Analista B | Abrir IDs conhecidos de processo e norma A por navegação/API autenticada | Acesso negado sem vazamento de dados A |
| U13 | Usuário sem atribuição A | Tentar registrar pré-conferência no processo A | Operação recusada pelo servidor, não apenas botão oculto |
| U14 | Diretoria | Conferir evidências e histórico segundo permissões | Acesso autorizado com identidade registrada; sem aprovação automática |
| U15 | Todos os perfis | Tema claro/escuro e telas menores | Cards legíveis, sem textos cortados ou sobreposição |
| U16 | QA pós-teste | Validar contagem de processos e guias oficiais | Dados de produção preservados; nenhuma alteração de fluxos externos |

## Falhas bloqueadoras
- Norma de município B exibida para A, ou consulta por B à norma/processo A.
- Pré-análise gravada sem analista autorizado, revisor, norma, referência ou evidência válida.
- Erro de histórico exibido como ausência de registro.
- Aprovação automática derivada de sugestão da IA.
- CI reprovado, revisão legal não confirmada ou teste navegador não executado.
- Qualquer modificação em processos, taxas, alvarás ou usuários reais no lugar de fixtures dedicadas.

## Evidências de execução
Para cada caso U01–U16: data/hora, SHA, URL de ambiente QA, navegador, perfil fictício, protocolo fictício, ação, resultado esperado/observado, status PASS/FAIL/BLOCKED, screenshot com dados sensíveis ocultos e identificação do responsável. Exigir fechamento dos FAIL e registrar impedimentos BLOCKED sem considerá-los aprovados.

## Limitação atual conhecida
O portão operacional encontra **zero normas ativas de QA e processos de apenas uma prefeitura**. Sem fixtures controladas de segunda prefeitura e sessão autenticada de navegador, a situação correta é **BLOQUEADO PARA HOMOLOGAÇÃO COMPLETA**, mesmo que todas as rotinas SQL sejam verdes.
