# 28/10/2026 — QA: PDF de guia PIX congelada bloqueado para supervisor

## Evidência concreta
Guia de teste `DAM-PRE-QA-20261028-PIXHMLG2`: `paid=false`, PIX e snapshot já vinculados, sem `original_pdf_key`. Captura da página mostra "PIX de homologação não concluído" e "Seu perfil não tem permissão para este documento". A abertura não deve reemitir PIX ou gerar nova cobrança.

A regra `has_process_access` permite o pré-protocolo **não oficializado** apenas para criador/partes e exclui supervisor/admin/financeiro municipal. O worker de arquivo original exigia essa regra, gerando HTTP 403. Além disso, a ação "get" sobre guia congelada podia entrar em `qa_mp_pix_save_v2`, que é deliberadamente proibido depois do snapshot, gerando o falso erro 503.

## Correção
- Um predicado QA restrito a prefeitura, processo correspondente, guia `protocolo` `DAM-PRE-QA-%` no ambiente `test`, status `pagamento_pendente`, processo ainda não oficializado e perfis `prefeitura_admin`, `prefeitura_supervisor` e `financeiro`. Não abre processos de outra prefeitura, não concede acesso a analista genérico, não altera `has_process_access`.
- Usa o mesmo predicado na autorização de arquivamento/leitura do PDF e recuperação PIX, mais conciliação **somente depois do hash PDF**. Não altera cobrança, ordem ou quitação.
- `get` sobre guia congelada retorna a reserva persistida após conferência de order/payment/PIX/guia, sem salvar nem recriar ordem. O status retornado deve indicar que é um snapshot, não crédito em tempo real.

## Aceite
Testar com JWTs reais de supervisor, profissional criador e segunda prefeitura, e confirmar upload + reabertura PDF (SHA igual) na função Neon QA. A migração é **QA-only** e não deve ser copiada integralmente para produção sem revisão independente.