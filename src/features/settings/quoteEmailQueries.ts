import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_QUOTE_EMAIL_SETTINGS,
  type QuoteEmailCard,
  type QuoteEmailSettings,
} from "./quoteEmailDefaults";

export type { QuoteEmailCard, QuoteEmailSettings };

/** The tenant's quote-email copy, with code defaults filled in for gaps. */
export function useQuoteEmailSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel_quote_email_settings", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<QuoteEmailSettings> => {
      const { data, error } = await supabase
        .from("hotel_quote_email_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      const d = DEFAULT_QUOTE_EMAIL_SETTINGS;
      if (!data) return d;
      const row = data as any;
      const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
      const cards = Array.isArray(row.cards) && row.cards.length ? (row.cards as QuoteEmailCard[]) : d.cards;
      return {
        hero_label: str(row.hero_label, d.hero_label),
        hero_headline: str(row.hero_headline, d.hero_headline),
        total_label: str(row.total_label, d.total_label),
        deposit_label: str(row.deposit_label, d.deposit_label),
        hold_line: str(row.hold_line, d.hold_line),
        cta_label: str(row.cta_label, d.cta_label),
        cta_subtext: typeof row.cta_subtext === "string" ? row.cta_subtext : d.cta_subtext,
        section_heading: str(row.section_heading, d.section_heading),
        cards,
        signoff_html: str(row.signoff_html, d.signoff_html),
        show_guidelines: row.show_guidelines !== false,
      };
    },
  });
}

export function useSaveQuoteEmailSettings(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: QuoteEmailSettings) => {
      const { error } = await supabase
        .from("hotel_quote_email_settings")
        .upsert({ tenant_id: tenantId, ...s } as any, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel_quote_email_settings", tenantId] });
    },
  });
}
