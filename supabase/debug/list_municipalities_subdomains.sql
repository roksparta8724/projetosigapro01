select id, name, subdomain, slug, status, custom_domain
from public.municipalities
where subdomain is not null and length(subdomain) > 0
order by created_at desc;
