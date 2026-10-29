# SIGAPRO - Relatorio de Remediacao de Dependencias

Ambiente: QA isolada, sem publicacao em producao.
Estrategia aplicada: compatible-only

## Resultado da auditoria npm
Runtime (--omit=dev): {"info":0,"low":7,"moderate":2,"high":4,"critical":1,"total":14}
Completa: {"info":0,"low":7,"moderate":6,"high":6,"critical":3,"total":22}

## Pendencias alta/critica
- high: @neondatabase/auth; reparo: true
- high: @neondatabase/auth-ui; reparo: true
- high: @neondatabase/neon-js; reparo: {"isSemVerMajor":true}
- critical: better-auth; reparo: true
- high: sharp; reparo: {"name":"sharp","version":"0.35.5","isSemVerMajor":true}
- critical: tinypool; reparo: {"name":"vitest","version":"5.0.5","isSemVerMajor":true}
- high: vite; reparo: {"name":"vite","version":"8.3.5","isSemVerMajor":true}
- critical: vitest; reparo: {"name":"vitest","version":"5.0.5","isSemVerMajor":true}
- high: zod; reparo: {"name":"zod","version":"4.6.7","isSemVerMajor":true}

## Validacao
npm ci, TypeScript, 980+ testes e build de producao rodaram com sucesso neste job.
Nao equivale a teste de contas reais, pagamento confirmado, PDF arquivado ou aceite municipal.
