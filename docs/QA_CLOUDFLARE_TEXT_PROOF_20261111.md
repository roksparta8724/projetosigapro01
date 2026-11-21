# Prova real Cloudflare PDF textual — execução única

Aciona apenas nesta implantação QA a extração textual de um PDF sintético previamente armazenado no R2 usando o serviço Cloudflare configurado. O comando é restringido à branch QA, usa o arquivo fixo e não solicita alteração de processo, não chama Claude e não realiza pagamentos.

Uma conversão de texto aprovada não é inspeção visual de implantação, nem aprovação de zoneamento. O resultado é determinado pelo teste real na Vercel.