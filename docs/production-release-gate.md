# SIGAPRO — Fechamento de homologação e publicação segura

Situação em 26/10/2026: NÃO LIBERADO PARA PRODUÇÃO. Este documento não autoriza alterações nos dados oficiais.

## Diagnóstico comprovado

- Branch GitHub de homologação: qa/sigapro-ia-logo-integrado-20261023; PR #92, ainda draft. 1.543 testes do Quality Gate, TypeScript, build, gerador PDF real e validação SQL haviam passado no commit a9c0c799.
- Projeto Neon red-sunset-21120522: produção br-summer-surf-b4s88rv5; QA br-solitary-sound-b4xlbvs6. Ambos usam o database sigapro_migration_stage_20260923. Não confie em current_database() para verificar se é QA!
- Produção possui dados bancários básicos e tabelas de configuração de arrecadação, mas faltam colunas document_snapshot, original_pdf_key, original_pdf_sha256, collection_mode_snapshot, collection_configuration_id e funções de PDF original. Também faltam novas tabelas urbanísticas.
- QA contém 9 guias, sendo 7 pagas; zero original PDF persistido. O teste sintético de geração do PDF não comprova upload/reabertura efetivos.
- O Vercel Hobby chegou ao limite por criar prévia para cada commit; agrupar alterações em uma revisão e validar o commit final exato.

## Pacote de liberação: SEM execução automática

1. Rodar node scripts/production-release-preflight.mjs para revisar o inventário financeiro. O script NÃO executa SQL nem libera o domínio.
2. Rodar scripts/production-schema-catalog.sql, em modo leitura, separadamente nos branch IDs de produção e QA, verificando também signatures, grants e RLS. Não executar toda a pasta de migrações.
3. Fazer revisão de DDL forward-only e testar em cópia de produção autorizada, com plano de recuperação, sem alterar pagamentos, processos, assinaturas ou objetos R2. Núcleo de DAM candidato: 20261017 campos bancários → 20261026 snapshot por guia → 20261021 original e provedor → 20261026 alinhamento de acesso → 20261026 PIX opcional → 20261026 bloqueio de emissão SIGAPRO para modo municipal_system. DDL novo é forward-only e NÃO altera guias antigas; exige validação em cópia real do branch oficial. Ajustes de arrecadação e IA urbanística exigem pacote e aceite separados; alguns arquivos contêm instruções QA-only mesmo sem _qa_ no nome.
4. Confirmar uma guia NOVA e autenticada no Mercado Pago SANDBOX: emissão persistida no Neon isolado; PDF permanente no bucket segregado; SHA idêntico na leitura e após F5/login; idempotência e conciliação sem duplicar cobrança.
5. Concluir os fluxos de Aprovação de Projeto e Habite-se com documentos, protocolo, analista responsável, diretor, vistoria, financeiro, assinaturas, histórico, conclusão e reabertura; testar perfis em duas prefeituras e proibir vazamento entre elas. Revisar tema claro/escuro, logos, avatares, zoom, impressão e ausência de telas piscando.
6. Publicar UMA prévia com o mesmo SHA aprovado, executar aceite autenticado, revisar backup/point-in-time Neon e preservação R2; publicar no domínio oficial SOMENTE com autorização expressa. Monitorar logs após a promoção.

## Travamento obrigatório

NÃO promover enquanto faltar qualquer: schema/RLS oficial comprovado; banco sandbox E2E; PDF original imutável comprovado; fluxos municipais aceitos; SHA de preview coincidente; rollback preparado e aprovação expressa.

## Limitação operacional constatada

Em 26/10/2026, a tentativa autorizada de criar branch Neon persistente a partir de produção retornou HTTP 422: branches limit exceeded. Nenhum branch antigo deve ser apagado automaticamente, e migrations devem permanecer NÃO APLICADAS até capacidade/autorização para homologar em cópia fiel.

No Vercel QA remoto, o emissor bancário real de sandbox não é exposto (somente localhost 8080/8081 com modo isolado); um PDF sintético no navegador remoto não representa emissão bancária verdadeira. Conexão Mercado Pago configurada e teste de conexão aprovado NÃO comprovam upload original. O aceite positivo exige sessão autorizada e cobrança nova isolada.
