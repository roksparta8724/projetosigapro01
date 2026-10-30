# Diagnóstico de upload direto de PDF no SIGAPRO

Motivo: a política CORS do bucket `sigapro-documentos` foi salva, mas o navegador continuou exibindo erro genérico.

No envio direto de PDF legal, após falha de rede:
1. O cliente **verifica pelo servidor** (HEAD autorizado) se o objeto inteiro chegou ao armazenamento; se sim, considera o upload concluído, mesmo que o navegador não consiga ler a resposta do PUT.
2. Se HEAD não confirma, o servidor realiza um **OPTIONS somente de leitura** usando a própria URL de PUT assinada, método, origem e cabeçalhos esperados. A URL assinada **nunca é devolvida** no diagnóstico.
3. O erro exibido distingue:
   - `R2_CORS_PREFLIGHT_DENIED`: origem/método/cabeçalhos não admitidos pelo bucket efetivo.
   - `R2_CORS_PREFLIGHT_OK`: CORS parece correto; investigar assinatura de PUT, endpoint/credenciais, permissão de gravação e limitações de rede.
   - `R2_PREFLIGHT_UNAVAILABLE`: a função não conseguiu testar R2.
   - `R2_DIAGNOSTIC_UNAVAILABLE`: o diagnóstico não pôde ser executado.
4. Nenhum objeto é apagado, regravado ou marcado como existente sem HEAD de tamanho e Content-Type correspondentes.

**Atenção**: OPTIONS realizado de Vercel não é idêntico ao preflight do navegador. Se a falha persistir após CORS OK, conferir F12 → Network → filtro `r2.cloudflarestorage.com` → status do OPTIONS e PUT. Não divulgar a URL completa assinada nem parâmetros `X-Amz-*` ao suporte.

A política do bucket deve continuar restrita ao subdomínio oficial, `PUT`, `Content-Type` e `If-None-Match`.

Fontes:
- https://developers.cloudflare.com/r2/platform/troubleshooting/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
