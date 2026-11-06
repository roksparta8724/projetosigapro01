# SIGAPRO — integração geoespacial do zoneamento (QA, 06/11/2026)

## Propósito e limite jurídico

A leitura de uma prancha arquitetônica, a localização cadastral e a determinação normativa são **três provas independentes**. Nenhuma cota textual, CEP, endereço livre, pin de geocodificador, OCR de mapa colorido ou legenda autoriza atribuir automaticamente a zona legal de um lote.

O primeiro contrato PostGIS faz **cruzamento determinístico de perímetro cadastral verificável com versão do mapa municipal georreferenciado que tenha sido conferida por autoridade municipal**. A interpretação dos índices da lei por zona/uso continua independente e exige cadastro jurídico, artigo, página, validade e aprovação humana. Nem a leitura de PDF nem este motor expedem alvarás.

## Fonte pública de Campo Limpo Paulista

- Prefeitura, LPUOS: https://campolimpopaulista.sp.gov.br/leis-urbanisticas — LC 379/2009, Anexo I (Mapa de Zoneamento), Anexo II (descrições perimétricas), Quadros I/II e minutas da revisão.
- Câmara, LC 379/2009: https://camaracampolimpo.sp.gov.br/legislacao/detalhe/1830/institui-a-lei-complementar-de-parcelamento-uso-e-ocupacao-do-solo-de-campo-limpo-paulista/.
- Não foi encontrada camada digital **oficial e validada** SHP/GeoJSON/GPKG vinculada a esse Anexo I nos materiais públicos consultados nesta etapa. O desenho PDF não deve ser transformado em polígonos jurídicos por inferência visual. É necessário documento geoespacial fornecido/confirmado pela Secretaria responsável, no SRC de origem declarado.
- Arquivos de proposta/revisão de 2026 NÃO devem ser cadastrados como mapa vigente.

## Migração em Neon QA

Somente branch `br-solitary-sound-b4xlbvs6` do projeto `red-sunset-21120522`:
- Extensão PostGIS 3.6.4 habilitada.
- `urban_zoning_map_versions_v1`: versão, referência, URL, SHA-256, vigência, status e autor/conferente.
- `urban_zoning_zone_geometries_v1`: feições jurídicas GeoJSON Polygon/MultiPolygon EPSG:4326, zona explícita, integridade, índices espaciais.
- `urban_zoning_parcel_geometries_v1`: perímetro de imóvel cadastral real, origem, hash, status e revisão humana.
- RLS ativada, zero políticas diretas; nenhuma concessão a `authenticated` para SELECT/INSERT/UPDATE/DELETE nas tabelas.
- RPCs `urban_zoning_create_map_draft_v1`, `urban_zoning_append_features_v1`, `urban_zoning_verify_map_v1`, `urban_zoning_stage_parcel_v1`, `urban_zoning_verify_parcel_v1`, `urban_zoning_list_maps_v1`, `urban_zoning_lookup_properties_v1` (somente administrador municipal de legislação), `urban_zoning_resolve_process_v1` (somente analista/supervisor com vínculo, sessão ativa e acesso processual).
- Antes da revisão, tudo é `draft_unverified`. O administrador da prefeitura pode manter **documentação legal/cadastral**, mas não recebe permissão de modificar andamento de processos.
- O endpoint do analista `server/ai-project-extract.ts` consulta o resolvedor espacial após autenticação, validação do processo, do município e da versão corrente do Projeto Arquitetônico. O PDF/relatório mostra fonte cartográfica, hashes e código da zona **somente quando a geometria foi validada**.
- A pré-conferência não registra resultado se a zona digitada for diferente da zona oficial confirmada por polígonos; sem mapa/lote a gravação permanece bloqueada.
- Importação de arquivo **original GeoJSON EPSG:4326** na interface de legislação: formato FeatureCollection, cada feição `properties.zone_code`, origem HTTPS e declaração de vigência. Dados com coordenadas UTM/SIRGAS devem ser transformados por procedimento GIS auditado e nunca interpretados como longitude/latitude.
- Rascunhos interrompidos podem ser retomados com o MESMO SHA-256 e IDs de feição; substituição silenciosa de uma geometria diferente é recusada.

## Como a classificação funciona

1. O processo deve ter `property_id` pertencente ao **mesmo tenant e município**. Processos novos criados por `create_external_process_v2/v4` já criam `properties` e relacionam `processes.property_id`.
2. O imóvel precisa de perímetro Polygon/MultiPolygon oriundo do cadastro e revisado, não apenas de coordenada central ou endereço.
3. Deve existir **exatamente uma** versão cartográfica revisada aplicável à data municipal de oficialização; 0 versões = sem mapa; 2+ versões = vigência ambígua.
4. O PostGIS exige que o lote inteiro esteja coberto por exatamente uma zona. Se tocar duas zonas, cruzar fronteira, cair fora do mapa ou apresentar sobreposição, retorna pendência e não faz média nem escolhe a zona maior.
5. A fonte (lei/anexo), versão, SHA-256 do mapa e do perímetro acompanham a resposta.
6. A verificação jurídica dos índices permanece separada até fonte vigente, artigo, página, uso e evidências homologadas.

## Evidências de QA e limites

- Verificadas instalação PostGIS, geometrias sintéticas SELECT (sem gravação), RLS e rejeição para chamada sem perfil autenticado.
- No processo QA04 `915e1c63-ebda-4cdd-8e95-34316d9e0089`, `property_id IS NULL`. O leitor pode extrair suas cotas fictícias, mas o zoneamento corretamente continua sem comprovação. **Não associar imóvel arbitrário a este processo**.
- No momento da implantação inicial: `0` mapas georreferenciados oficiais, `0` feições e `0` perímetros homologados, além de `0` normas urbanísticas reais juridicamente ativas na QA. Nenhum mapa fictício foi inserido no banco para mascarar o bloqueio.
- Testes unitários reproduzem ausência de inscrição, CRS incompatível, zona sem código, duplicatas, parcelamento em lotes, fonte hash inválida e proibição de conclusão legal automática.
- Falta aceite E2E autenticado: upload oficial do geodado, perímetro cadastral próprio, comparação real com mapa revisado, perfis autorizados e relatório de conformidade com legislação vigente por zona/uso/índice.
- PR #118 permanece DRAFT. Não mesclar em main, não alterar Neon production, não publicar sigapromunicipal.com.br sem aceite explícito da release.
