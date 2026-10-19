import { afterEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoGuideBoleto } from "./mercadopago";

const line = "23793388096060157364540663333335168400000300000";
const barcode = "23795168400000300003388060157364506333333510";

function successPayload(complete = true) {
  return {
    id: "ORDTEST123",
    external_reference: "DAM-ISS-2026-00002",
    status: "action_required",
    status_detail: "waiting_payment",
    total_amount: "300.00",
    transactions: {
      payments: [
        {
          id: "PAYTEST123",
          status: "action_required",
          status_detail: "waiting_payment",
          amount: "300.00",
          payment_method: {
            id: "boleto",
            type: "ticket",
            financial_institution: "boleto",
            ...(complete
              ? {
                  digitable_line: line,
                  barcode_content: barcode,
                  ticket_url: "https://example.test/boleto",
                }
              : {}),
          },
        },
      ],
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN_TEST;
  delete process.env.MERCADOPAGO_ENV;
});

describe("Mercado Pago guide boleto adapter", () => {
  it("returns official banking data for the existing SIGAPRO guide", async () => {
    process.env.MERCADOPAGO_ENV = "test";
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST = "APP_USR_TEST";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(successPayload(true)), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await createMercadoPagoGuideBoleto({
      guideCode: "DAM-ISS-2026-00002",
      amount: 300,
      dueDate: "2026-10-15",
      description: "ISSQN / Projeto",
    });

    expect(result).toMatchObject({
      ok: true,
      environment: "test",
      orderId: "ORDTEST123",
      paymentId: "PAYTEST123",
      externalReference: "DAM-ISS-2026-00002",
      digitableLine: line,
      barcodeContent: barcode,
    });

    const [, init] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body || "{}"));
    expect(requestBody.external_reference).toBe("DAM-ISS-2026-00002");
    expect(requestBody.total_amount).toBe("300.00");
    expect(requestBody.transactions.payments[0].amount).toBe("300.00");
    expect(requestBody.transactions.payments[0].payment_method).toEqual({
      id: "boleto",
      type: "ticket",
    });
  });

  it("refetches the order when the POST response has not exposed banking fields yet", async () => {
    process.env.MERCADOPAGO_ENV = "test";
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST = "APP_USR_TEST";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successPayload(false)), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successPayload(true)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await createMercadoPagoGuideBoleto({
      guideCode: "DAM-ISS-2026-00002",
      amount: 300,
    });

    expect(result.ok).toBe(true);
    expect(result.digitableLine).toBe(line);
    expect(result.barcodeContent).toBe(barcode);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1/orders/ORDTEST123");
  });
});
