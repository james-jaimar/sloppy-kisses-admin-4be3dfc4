// Default copy for the hotel quote email. A tenant row in
// `hotel_quote_email_settings` overrides any of these; where the row (or a
// field on it) is missing we fall back to exactly what shipped in code, so
// nothing changes for a tenant that has never touched the settings screen.

export interface QuoteEmailCard {
  id: string;
  title: string;
  body_html: string;
  enabled?: boolean;
}

export interface QuoteEmailSettings {
  hero_label: string;
  hero_headline: string;
  total_label: string;
  deposit_label: string;
  hold_line: string;
  cta_label: string;
  cta_subtext: string;
  section_heading: string;
  cards: QuoteEmailCard[];
  signoff_html: string;
  show_guidelines: boolean;
}

const ul = (items: string[]) =>
  `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export const DEFAULT_QUOTE_EMAIL_CARDS: QuoteEmailCard[] = [
  {
    id: "arrival",
    title: "Arrival & collection",
    enabled: true,
    body_html: ul([
      "<strong>Arrivals</strong>: Mon–Sat, 09:00–11:00. No arrivals on Sundays or public holidays.",
      "<strong>Collection</strong>: 09:00–09:30, Mon–Sun.",
      "<strong>Stay &amp; Play collection</strong>: 16:00–16:30, Mon–Sun (additional fee).",
      "Closed for drop-offs and collections on 25 &amp; 26 December and 1 January.",
      "Our gates are only open during these windows, so please keep to the times booked.",
    ]),
  },
  {
    id: "before",
    title: "Before you arrive",
    enabled: true,
    body_html: ul([
      "Dogs must be sterilised, fully vaccinated and dewormed.",
      "Kennel Cough (Bordetella) must be done at least <strong>10 days before</strong> arrival.",
      "Bring or upload the vaccination card — we cannot check in without it.",
      "Tick, flea and deworming treatment (e.g. NexGard Spectra / Revolution) up to date.",
      "All guests must be social with other dogs, and wear a collar with a name tag and contact number.",
    ]),
  },
  {
    id: "pack",
    title: "What to pack",
    enabled: true,
    body_html: ul([
      "Food in individually labelled ziplock bags, marked with your dog's <strong>name and breed</strong>.",
      "Written feeding instructions — only food you supply is fed.",
      "Medication with clear written instructions.",
      "No beds, bowls, pillows or extras needed; anything extra must be clearly labelled.",
    ]),
  },
  {
    id: "where",
    title: "Where they'll stay",
    enabled: true,
    body_html: ul([
      "<strong>Cuddle Inn – Puppy Paradise</strong>: small dogs, common space with TV and private garden.",
      "<strong>Barkside Inn – Cabanas</strong>: private room, two beds, private garden, up to 3 dogs.",
      "<strong>Bark Avenue – Deluxe</strong>: private room, queen bed, TV, aircon and private garden.",
    ]),
  },
  {
    id: "good-to-know",
    title: "Good to know",
    enabled: true,
    body_html: ul([
      "<strong>50% off grooming</strong> when booked with the stay — most dogs go home fresh after all the play.",
      "Daily photos go up on our Facebook page; emergencies are always communicated directly.",
      "Hotel viewings are welcome Mon–Fri, 10:00–13:00.",
      "Your dog may be tired for a day or two after all the fun — that's completely normal.",
    ]),
  },
];

export const DEFAULT_QUOTE_EMAIL_SETTINGS: QuoteEmailSettings = {
  hero_label: "Hotel quote {{quote.number}}",
  hero_headline: "A holiday for {{pet.names}}",
  total_label: "Total for the stay",
  deposit_label: "50% deposit to secure",
  hold_line: "These dates are held for you until {{quote.valid_until}}.",
  cta_label: "Accept this quote",
  cta_subtext: "Prefer to chat? Just reply to this email.",
  section_heading: "Everything you need before the stay",
  cards: DEFAULT_QUOTE_EMAIL_CARDS,
  signoff_html:
    "<p>We can't wait to spoil {{pet.names}}.</p><p>Warmly,<br/><strong>The {{tenant.name}} team</strong></p>",
  show_guidelines: true,
};

/** Merge a (possibly partial / null) settings row over the defaults. */
export function resolveQuoteEmailSettings(row: any): QuoteEmailSettings {
  const d = DEFAULT_QUOTE_EMAIL_SETTINGS;
  if (!row) return d;
  const str = (v: unknown, fb: string) =>
    typeof v === "string" && v.trim() ? v : fb;
  const cards = Array.isArray(row.cards)
    ? (row.cards as QuoteEmailCard[]).filter((c) => c && c.enabled !== false)
    : d.cards;
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
}
