/**
 * Shared flight for browser refreshes that read the same authenticated store.
 * Caches only the in-progress Promise, never resolved data or privileges.
 * Different identities and process scopes must never share a request.
 */
export class IdentityScopedSingleFlight {
  private readonly tasks = new Map<string, Promise<unknown>>();

  run<T>(identity: string, scope: string, task: () => Promise<T>): Promise<T> {
    if (!identity) return Promise.reject(new Error("Sessão autenticada ausente."));
    const key = JSON.stringify([identity, scope]);
    const existing = this.tasks.get(key);
    if (existing) return existing as Promise<T>;

    const promise = Promise.resolve().then(task);
    this.tasks.set(key, promise);
    const cleanup = () => {
      if (this.tasks.get(key) === promise) this.tasks.delete(key);
    };
    // Consumed rejection handler prevents an extra unhandled rejection.
    promise.then(cleanup, cleanup);
    return promise;
  }
}
