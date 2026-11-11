import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const calls: any[] = [];
vi.mock("@/lib/supabase/client", () => {
  const chain: any = { update: (v: any) => { calls.push(["update", v]); return chain; }, eq: (k: string, v: string) => { calls.push(["eq", k, v]); return chain; }, select: async () => ({ data: [{ id: "e1" }], error: null }) };
  return { supabase: { from: () => chain } };
});
import { useClearNotificationWarning } from "./queries";

describe("clearing comms warnings", () => {
  it("only clears a failed message and refreshes the red count", async () => {
    const qc = new QueryClient(); const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useClearNotificationWarning("t1"), { wrapper });
    await act(() => result.current.mutateAsync("e1"));
    expect(calls).toContainEqual(["update", { status: "skipped" }]);
    expect(calls).toContainEqual(["eq", "status", "failed"]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["nav-badges", "comms_failed", "t1"] });
  });
});
