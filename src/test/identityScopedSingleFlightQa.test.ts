import { describe, expect, it, vi } from "vitest";
import { IdentityScopedSingleFlight } from "@/lib/identityScopedSingleFlight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res; reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SIGAPRO QA — refresh operacional isolado e sem tempestade de consultas", () => {
  it("faz uma só consulta para dez solicitações simultâneas do mesmo processo", async () => {
    const flights = new IdentityScopedSingleFlight();
    const pending = deferred<number>();
    const fn = vi.fn(() => pending.promise);
    const results = Array.from({length:10}, () => flights.run("userA","process01",fn));
    expect(results.every(result => result === results[0])).toBe(true);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    pending.resolve(42);
    expect(await Promise.all(results)).toEqual(Array(10).fill(42));
    const second = flights.run("userA","process01",async()=>99);
    expect(await second).toBe(99);
  });

  it("não compartilha requests entre prefeituras, identidades ou processos", async () => {
    const flights = new IdentityScopedSingleFlight();
    const fn = vi.fn(async()=>"ok");
    const results=await Promise.all([
      flights.run("userA","processA",fn),
      flights.run("userA","processB",fn),
      flights.run("userB","processA",fn),
      flights.run("userA","",fn),
    ]);
    expect(results).toEqual(["ok","ok","ok","ok"]);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("não armazena erro e deixa revalidar após falha", async () => {
    const flights = new IdentityScopedSingleFlight();
    const fn=vi.fn().mockRejectedValueOnce(new Error("intermitente")).mockResolvedValueOnce("ok");
    const first=flights.run("userA","",fn);
    const second=flights.run("userA","",fn);
    expect(first).toBe(second);
    await expect(first).rejects.toThrow("intermitente");
    await expect(flights.run("userA","",fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rejeita revalidação de sessão não autenticada sem invocar rede", async () => {
    const flights = new IdentityScopedSingleFlight();
    const fn=vi.fn(async()=>true);
    await expect(flights.run("","processA",fn)).rejects.toThrow("Sessão");
    expect(fn).not.toHaveBeenCalled();
  });
});
