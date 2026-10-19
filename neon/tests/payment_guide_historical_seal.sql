-- Executado exclusivamente em PostgreSQL descartável no GitHub Actions.
CREATE TABLE public.payment_guides (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 guide_number text, guide_kind text, process_id text, tenant_id text,
 municipality_id text, property_id text, amount numeric, due_date date,
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
 paid boolean NOT NULL DEFAULT false, status text NOT NULL,
 bank_reference text
);
\ir ../migrations/20261019152000_payment_guide_historical_seal.sql
INSERT INTO public.payment_guides
(guide_number, guide_kind, amount, due_date, created_at, paid_at, paid, status)
VALUES
('QUITADA', 'iss_obra', 300, '2026-10-29', '2026-10-18 13:00:00+00', '2026-10-19 10:00:00+00', true, 'compensada'),
('LEGADA', 'protocolo', 300, '2026-10-29', '2026-10-18 13:00:00+00', NULL, false, 'confirmed'),
('ABERTA', 'protocolo', 300, '2026-10-29', '2026-10-18 13:00:00+00', NULL, false, 'pendente');
DO $assert$
DECLARE blocked boolean;
BEGIN
 -- Modificar a emissão deve falhar até em guia pendente.
 blocked := false;
 BEGIN UPDATE public.payment_guides SET created_at = now() WHERE guide_number='ABERTA';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%data original de emissao%' THEN blocked := true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'created_at modificável'; END IF;
 -- O histórico financeiro de uma guia compensada é imutável.
 blocked := false;
 BEGIN UPDATE public.payment_guides SET amount=1 WHERE guide_number='QUITADA';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%documento financeiro historico%' THEN blocked := true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'valor de guia paga modificável'; END IF;
 blocked := false;
 BEGIN UPDATE public.payment_guides SET paid=false WHERE guide_number='QUITADA';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%baixa de uma guia%' THEN blocked := true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'baixa de guia paga reversível'; END IF;
 blocked := false;
 BEGIN UPDATE public.payment_guides SET paid_at=now() WHERE guide_number='QUITADA';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%data original de pagamento%' THEN blocked := true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'data de baixa paga modificável'; END IF;
 blocked := false;
 BEGIN UPDATE public.payment_guides SET status='pendente' WHERE guide_number='QUITADA';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%status financeiro%' THEN blocked := true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'status de guia paga retrocedeu'; END IF;
 -- Registro legado confirmado não recebe uma baixa artificial.
 UPDATE public.payment_guides SET bank_reference='comprovacao-pendente' WHERE guide_number='LEGADA';
 IF EXISTS (SELECT 1 FROM public.payment_guides WHERE guide_number='LEGADA' AND (paid OR paid_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'confirmada legada recebeu baixa inventada';
 END IF;
 UPDATE public.payment_guides SET bank_reference='recebido' WHERE guide_number='QUITADA';
 IF NOT EXISTS (SELECT 1 FROM public.payment_guides WHERE guide_number='QUITADA' AND paid AND amount=300 AND created_at='2026-10-18 13:00:00+00'::timestamptz) THEN
   RAISE EXCEPTION 'dados históricos foram alterados';
 END IF;
 RAISE NOTICE 'PASS: proteção histórica executada em PostgreSQL real e descartável';
END
$assert$;
