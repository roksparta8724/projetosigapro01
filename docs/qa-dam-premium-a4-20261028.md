# 28/10/2026 - DAM A4 premium: QA rendering fix

The attached one-page original PDF has visible table/field collisions: header guide number crosses the exercise cell, responsibility/observation/summary overlap, receipt municipality title is clipped, and long transaction identifiers are too cramped. These failures are in the HTML/CSS capture path (`src/lib/guidePdf.ts` -> `buildGuiaRecolhimentoOficialHtml`), not in the original bank PIX.

The layout fix adds a **shared screen/html2canvas A4 style** with contained guide numbers, balanced tax-table columns, taller and flexible name/receipt cards, more readable labels, and a compact empty barcode placeholder for PIX-only. A document renderer guard now refuses PDF archiving on scroll overflow of the page or the critical cards. Existing immutable PDF bytes and SHA must NOT be changed; test the corrected appearance using a NEW isolated QA preview/guide with no duplicate bank charge. Publishing this CSS alone to production is forbidden before CI+visual acceptance.

The data, PIX code, amounts, document snapshot, provider reference and QR value remain unchanged. QA branch only.