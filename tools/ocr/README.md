# SIGAPRO OCR local isolado — sem créditos de IA

Protótipo funcional para PDF **rasterizado** (sem camada de texto), não habilitado automaticamente no portal QA/produção. Usa Poppler (\`pdfinfo\`, \`pdftoppm\`) e Tesseract (\`por+eng\`) **sem internet**, sem API paga e sem chave de provedor. Até 8 MiB, 16 páginas e 150 segundos por documento; OCR individual por página e SHA-256 do PDF.

Saída JSON: \`source=sigapro_local_ocr_text_only\`, \`pages[{page,text,has_text,requires_visual_review}]\`, \`automaticallyApproved=false\`, \`measurementsVerified=false\`. **OCR não mede recuos nem geometria, não confirma legislação, não autoriza pagamento e não emite parecer.** Texto extraído pode conter erros e dados pessoais: não enviar documentos reais antes da integração autenticada com a plataforma.

## Teste local — somente PDF sintético autorizado

\`\`\`bash
python3 -m unittest tools/ocr/test_scan_pdf.py -v
python3 tools/ocr/scan_pdf.py ./fixture-sintetico.pdf --output ./resultado-privado.json
\`\`\`

## Uso futuro em VPS Linux, somente em sandbox isolado

\`\`\`bash
docker build -f tools/ocr/Dockerfile -t sigapro-ocr:qa .
docker run --rm --network none --read-only --cpus 1 --memory 768m \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  -v "$PWD/qa-input:/input:ro" -v "$PWD/qa-output:/output:rw" \
  sigapro-ocr:qa /input/fixture-sintetico.pdf --output /output/resultado.json
\`\`\`

Requer volumes com permissão de UID 10001. A ferramenta aceita caminho local, não URL e não expõe API HTTP. Para usar documentos reais, falta integrar fila autenticada por município, criptografia e retenção dos resultados, antimalware, isolamento, trilha de auditoria e interface de revisão humana.

**Prova técnica em 07/11/2026:** em PDF raster sintético formado por imagem, \`pdfinfo\` + \`pdftoppm\` + \`tesseract\` identificaram "PLANTA DE IMPLANTACAO", "Recuo frontal proposto: 5,00 m" e "Area do terreno: 1.200,00 m2"; o resultado continuou sem atribuir medidas verificadas nem aprovar projeto. Não é gabarito de precisão para projetos reais.
