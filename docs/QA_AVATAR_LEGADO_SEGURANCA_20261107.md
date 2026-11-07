# SIGAPRO — recuperação de avatar legado: diagnóstico e endurecimento (QA, 07/11/2026)

## Evidência operacional

Consulta read-only aos erros agregados do projeto Vercel `projetosigapro01` identificou
uma classe de falha em produção: `[SIGAPRO][AvatarLegacy] Falha ao recuperar foto antiga`
por `TypeError: fetch failed` / `getaddrinfo ENOTFOUND` ao contatar o host histórico
de armazenamento Supabase. Foram observadas sete ocorrências no período consultado,
última em 07/11/2026, todas no deployment da branch `main`.
Esse log **não prova perda de dados** nem autoriza sobrescrever fotos no banco.

## Causa e riscos associados encontrados no código

- O endpoint `server/api/profile-avatar-open.ts` priorizava R2, mas quando não
  encontrava cache procurava diretamente qualquer host com sufixo `supabase.co`.
- A recuperação remota admitia `redirect:"follow"`; destinos finais não eram
  revalidados, abrindo risco de servidor atuar como proxy de requisições não pretendidas.
- Uma resposta com `Content-Type:image/*` era suficiente para servir os bytes,
  sem conferir assinatura de imagem e sem bloquear SVG.
- `response.arrayBuffer()` lia toda a resposta sem limite efetivo por streaming
  quando o servidor remoto não fornecia `Content-Length`.
- Os erros completos do provedor eram registrados, causando ruído operacional
  e possível exposição desnecessária de detalhes em logs.

## Correção aplicada exclusivamente em QA

1. Permanecem os acessos prioritários a avatares atuais `r2:` e imagens históricas
   já cacheadas no R2; não foi excluído objeto ou registro.
2. Acesso HTTP legado ocorre **somente** se
   `SIGAPRO_LEGACY_AVATAR_SOURCE_ORIGIN` contiver a origem HTTPS exata
   do projeto histórico confirmado e acessível. **Padrão sem configuração = desligado.**
   Não definir esse valor com domínio fornecido pelo navegador.
3. URLs legadas exigem subdomínio `*.supabase.co` legítimo, HTTPS sem
   credenciais nem porta customizada e caminho público de avatar.
4. `fetch(..., redirect:"error")` impede seguir redirecionamento para outro serviço.
5. Arquivos em cache e remotos só são devolvidos como PNG/JPEG/GIF/WebP/AVIF
   quando os bytes têm assinatura compatível; `SVG`, `HTML` e valores de MIME
   forjados não são servidos como imagem ativa. Resposta usa `nosniff`.
6. Leitura remota em streaming é interrompida antes de ultrapassar
   `MAX_AVATAR_BYTES`; timeouts são limpos em `finally`.
7. Falhas retornam mensagem administrativa sem dados pessoais ou erro bruto
   do provedor nos logs. O cadastro e as fotos existentes no R2 são preservados.

## Testes e próximos gates

- Testes `server/api/profile-avatar-open.security.test.ts` cobrem host
  exato, URLs proibidas, assinatura do arquivo, SSRF, `redirect:error`, prioridade
  de cache e tamanho de resposta.
- Executar CI do HEAD QA e confirmar a publicação Vercel Preview por SHA;
  **não** dizer que o portal oficial foi corrigido antes do merge aprovado.
- Testar com sessões reais Master, Prefeitura e servidores: foto nova em R2;
  foto legada já cacheada; foto legada indisponível deve mostrar fallback de iniciais.
- Para recuperação de imagens históricas ainda **não cacheadas**, verificar o
  projeto Supabase antigo e sua disponibilidade, configurar a origem exata
  apenas em ambiente autorizado, executar migração sob sessão e auditoria
  e confirmar hash/permissão antes de atualizar referências oficiais.
  Se o armazenamento antigo foi removido, o sistema não pode recriar
  imagens que não estão no R2; o usuário autorizado deverá fornecer uma nova foto.
- Não habilitar permissão externa automaticamente, não reativar legado para
  produção sem validação, não alterar `main`, Neon production ou o domínio oficial.
