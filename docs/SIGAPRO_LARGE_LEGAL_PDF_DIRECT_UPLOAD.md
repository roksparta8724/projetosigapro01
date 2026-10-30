# SIGAPRO — PDFs legais municipais maiores que 30 MiB

## Corrigido no código
O limite anterior de 30 MiB não era a única causa da falha. O upload legado envia Base64 inteiro para uma função da Vercel, cujo limite de corpo é **4,5 MB**. Novas versões de PDF de legislação acima de 2 MiB utilizam **PUT diretamente ao R2/S3 por URL pré-assinada**. Os bytes não transitam pela Vercel.

- Limite novo para PDF de legislação: **100 MiB**. Logos e imagens institucionais continuam com 30 MiB.
- Somente as quatro pastas \`legislation-plano-diretor\`, \`legislation-uso-solo\`, \`legislation-zoneamento\` e \`legislation-leis-complementares\`, com \`municipalityId\` válido, podem usar o caminho direto.
- \`POST /api/r2?action=legal-sign-put\` exige JWT, autorização municipal, perfil admin/master e consulta da cota de armazenamento antes de assinar.
- O link de upload vale 300 segundos, é exclusivo de uma chave de objeto e é emitido com \`If-None-Match: *\` para evitar sobrescrita de documentos antigos.
- Após o PUT, o cliente chama a API autenticada de **verify**, que faz \`HeadObject\` e compara tamanho e Content-Type antes de vincular a referência no Neon.
- O R2 recebe o arquivo original sem convertê-lo em Base64; só o link assinado temporário passa pelo navegador.
- A integração respeita armazenamento próprio municipal S3 já habilitado, sem usar credenciais do R2 do SIGAPRO para esse caso.
- O fluxo existente de documentos, financeiro, guias DAM e assinaturas não foi alterado.
- Se o PUT falhar, os PDFs antigos permanecem vinculados no banco. Um novo upload usa um object key com UUID.

## Passo de infraestrutura obrigatório: política CORS do bucket (a confirmar)
No **Cloudflare → R2 → bucket de documentos usado pelo SIGAPRO (variável Vercel \`R2_BUCKET_DOCUMENTOS\`) → Settings → CORS Policy**, configurar regra para a origem exata da prefeitura que vai enviar documentos:

\`\`\`json
[
  {
    "AllowedOrigins": ["https://campolimpopaulista.sigapromunicipal.com.br"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "MaxAgeSeconds": 3600
  }
]
\`\`\`

**Preservar regras CORS já existentes; não substituir configurações de outros aplicativos sem revisar.** Adicionar origens explícitas de outras prefeituras quando necessário, sem usar \`*\` para acesso indiscriminado. Se a Prefeitura estiver usando armazenamento próprio S3 (BYOS), aplicar CORS equivalente no seu bucket, conforme o provedor.

A política de CORS **não abre o bucket para gravação anônima**: o PUT exige assinatura temporária e exclusiva de um objeto específico. CORS não substitui autenticação nem autorização.

## Gate de homologação
1. Cadastrar regra CORS (se ainda não houver).
2. Com perfil administrador autorizado, enviar um PDF de teste **maior que 30 MiB** (sem dados sensíveis).
3. Observar o PUT assinado retornar sucesso; API verify confirmar mesmo tamanho.
4. Clicar **Salvar arquivos oficiais** e reabrir PDF pelo módulo Legislação; verificar que outro município não consegue alterar esse acervo.
5. Confirmar preservação do PDF anterior e não alteração dos demais documentos.
6. Se CORS não estiver configurado, o erro deve ser explícito e o sistema **não** fingirá upload bem-sucedido.

Cloudflare R2: https://developers.cloudflare.com/r2/buckets/cors/ .
Vercel: https://vercel.com/docs/functions/limitations .

## Limite do plano Vercel
O plano Hobby do projeto permite no máximo 12 funções Serverless. O handler de assinatura foi incorporado à rota **já existente** `api/r2.ts`, com o arquivo de implementação fora da pasta `api/`. Nenhuma função extra foi adicionada; isso evita falhas de publicação por excesso de rotas.
