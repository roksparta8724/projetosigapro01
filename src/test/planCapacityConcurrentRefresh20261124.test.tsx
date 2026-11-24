// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanCapacityLive } from "@/hooks/usePlanCapacityLive";

type Response = { data: unknown; error: null };
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn<() => Promise<Response>>() }));
vi.mock("@/integrations/backend/databaseClient", () => ({
  hasBackendEnv: true,
  backendClient: { rpc },
}));

const result = (planName: string): Response => ({
  data: [{ municipalityId: "municipality-qa", configured: true, planId: planName, planName }],
  error: null,
});

describe("Plan capacity concurrent refresh", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  it("replays a data-change event received during the initial read", async () => {
    let finish!: (value: Response) => void;
    rpc.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(result("Premium"));
    const { result: state, unmount } = renderHook(() =>
      usePlanCapacityLive("municipality-qa", { intervalMs: 60000 }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("sigapro:data-changed"));
      window.dispatchEvent(new Event("sigapro:data-changed"));
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => { finish(result("Pro")); });
    await waitFor(() => expect(state.current.rows[0]?.planName).toBe("Premium"));
    expect(rpc).toHaveBeenCalledTimes(2);
    unmount();
    vi.restoreAllMocks();
  });
  it("does not expose an earlier snapshot after the hook is disabled", async () => {
    rpc.mockResolvedValueOnce(result("Premium"));
    const { result: state, rerender, unmount } = renderHook(
      ({ enabled }) => usePlanCapacityLive("municipality-qa", { enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(state.current.loaded).toBe(true));
    rerender({ enabled: false });
    expect(state.current.rows).toEqual([]);
    expect(state.current.loaded).toBe(false);
    unmount();
    vi.restoreAllMocks();
  });
});
