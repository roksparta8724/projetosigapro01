-- Vincula notificações antigas de assinatura do Alvará ao processo real.
update public.notifications n
set process_id=p.id,
    municipality_id=coalesce(n.municipality_id,p.municipality_id,p.tenant_id),
    source_profile_id=coalesce(n.source_profile_id,p.analysis_assigned_to_profile_id),
    action_url=coalesce(n.action_url,'/processos/'||p.id::text||'?aba=alvara'),
    category=case when coalesce(n.category,'sistema')='sistema' then 'assinatura' else n.category end,
    priority=case when coalesce(n.priority,'normal')='normal' then 'alta' else n.priority end,
    dedupe_key=coalesce(
      n.dedupe_key,
      case
        when n.profile_id is not null
        then 'permit:legacy-request:'||p.id::text||':'||n.profile_id::text
        else null
      end
    )
from public.processes p
where n.type='assinatura'
  and n.process_id is null
  and n.message ilike '%'||p.protocol_number||'%';
