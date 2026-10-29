# SIGAPRO - Relatorio de Remediacao de Dependencias

Ambiente: QA isolada, sem publicacao em producao.
Estrategia aplicada: neon-and-toolchain

## Resultado da auditoria npm
Runtime (--omit=dev): {"info":0,"low":6,"moderate":2,"high":4,"critical":1,"total":13}
Completa: {"info":0,"low":6,"moderate":4,"high":5,"critical":1,"total":16}

## Pendencias alta/critica
- high: @neondatabase/auth; reparo: true
- high: @neondatabase/auth-ui; reparo: true
- high: @neondatabase/neon-js; reparo: {"isSemVerMajor":true}
- critical: better-auth; reparo: true
- high: sharp; reparo: {"name":"sharp","version":"0.35.5","isSemVerMajor":true}
- high: zod; reparo: {"name":"zod","version":"4.6.7","isSemVerMajor":true}

## Validacao
npm ci, TypeScript, 980+ testes e build de producao rodaram com sucesso neste job.
Nao equivale a teste de contas reais, pagamento confirmado, PDF arquivado ou aceite municipal.
