# SIGAPRO

Sistema institucional para protocolo, analise e acompanhamento de projetos e obras em prefeituras.

## Estrutura atual

- acesso com senha
- visao do administrador geral
- administracao da prefeitura
- mesa de analise
- financeiro
- acesso externo para profissionais
- base preparada para Supabase com politicas de acesso e separacao por prefeitura

## Como executar

```bash
npm install
npm run dev
```

## Variaveis de ambiente

Use `.env.example`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Banco de dados

A migration principal esta em:

`supabase/migrations/20260318143000_rebuild_public_approval_saas.sql`

Ela cria a base nova com:

- prefeituras
- perfis e vinculos de acesso
- processos
- documentos
- guias
- assinaturas
- conectores
- trilha de auditoria

## Observacao

Enquanto o schema novo nao estiver aplicado e populado, o sistema usa uma base de demonstracao para exibir a arquitetura do produto.
