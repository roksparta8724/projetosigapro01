# SIGAPRO — prova única de visão real por IA

Este commit aciona uma única execução do teste protegido `server/qa-live-visual-once.test.ts` na build Preview da branch QA.

- Somente o PDF sintético QA04 armazenado no R2; nenhuma planta municipal de produção ou documento do usuário
- Uma chamada externa de leitura visual via provedor configurado, sem repetição automática em builds seguintes
- Não modifica processos, pagamentos, nem aprova lei ou alvará
- Se o provedor estiver indisponível/sem créditos ou não reconhecer as três cotas, a construção da prévia deve falhar de modo explícito
- Resultado da execução deve ser lido nos logs do build, não inferido por configuração de credenciais

Execução autorizada para encerrar a pendência objetiva da leitura visual do sistema. Não implica aprovação automática de qualquer planta real.