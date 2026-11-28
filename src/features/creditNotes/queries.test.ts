import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), useQuery: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

import { useCreditNote, useCreditNotes } from "./queries";

const note = {
  id: "credit-54", credit_note_number: "CN-00054", total: 1100,
  customer: { full_name: "Mekela Bastos" },
  invoice: { id: "invoice-70110", invoice_number: "INV-70110" },
};

describe("credit-note invoice relationships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQuery.mockImplementation((options) => options);
    mocks.from.mockImplementation((table: string) => {
      let selection = "";
      let single = false;
      const builder = {
        select: vi.fn((value: string) => { selection = value; return builder; }),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        maybeSingle: vi.fn(() => { single = true; return builder; }),
        then: (resolve: (value: unknown) => unknown) => {
          // Model PostgREST's ambiguity when both original and rebill links exist.
          if (table === "credit_notes" && !selection.includes("invoice:invoices!credit_notes_invoice_id_fkey(")) {
            return Promise.resolve(resolve({ data: null, error: { code: "PGRST201" } }));
          }
          return Promise.resolve(resolve({ data: table === "credit_notes" ? (single ? note : [note]) : [], error: null }));
        },
      };
      return builder;
    });
  });

  it("loads the list using the original invoice, not the rebilled invoice", async () => {
    const query = useCreditNotes("tenant") as unknown as { queryFn: () => Promise<unknown> };
    expect(await query.queryFn()).toEqual([note]);
  });

  it("loads detail with the original invoice and its items/applications", async () => {
    const query = useCreditNote("credit-54", "tenant") as unknown as { queryFn: () => Promise<unknown> };
    expect(await query.queryFn()).toEqual({ ...note, items: [], applications: [] });
  });
});