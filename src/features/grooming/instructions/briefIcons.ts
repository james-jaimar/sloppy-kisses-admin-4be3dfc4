import {
  Bath, Brush, Dog, Droplet, Ear, Eye, Footprints, Gift, Hand, Heart, PawPrint,
  Phone, MessageSquare, Ruler, Scissors, ShieldAlert, Smile, SmilePlus, Sparkles,
  Star, StickyNote, Stethoscope, Wind,
} from "lucide-react";

/** Curated icon set the owner can pick from for each grooming instruction group. */
export const BRIEF_ICONS = {
  scissors: Scissors,
  sparkles: Sparkles,
  droplet: Droplet,
  bath: Bath,
  brush: Brush,
  eye: Eye,
  ear: Ear,
  smile: Smile,
  "smile-plus": SmilePlus,
  hand: Hand,
  "paw-print": PawPrint,
  footprints: Footprints,
  dog: Dog,
  wind: Wind,
  ruler: Ruler,
  gift: Gift,
  heart: Heart,
  star: Star,
  stethoscope: Stethoscope,
  "shield-alert": ShieldAlert,
  "message-square": MessageSquare,
  "sticky-note": StickyNote,
  phone: Phone,
} as const;

export type BriefIconName = keyof typeof BRIEF_ICONS;

export const BRIEF_ICON_NAMES = Object.keys(BRIEF_ICONS) as BriefIconName[];

export function briefIcon(name: string | null | undefined) {
  return (name && BRIEF_ICONS[name as BriefIconName]) || Scissors;
}

/** Colour tokens available per group — all semantic, no raw colours. */
export const BRIEF_COLOURS = {
  coral: {
    label: "Coral",
    chip: "bg-sk-coral-soft text-sk-coral-dark",
    ring: "border-sk-coral/40",
    swatch: "bg-sk-coral",
  },
  turquoise: {
    label: "Turquoise",
    chip: "bg-sk-turquoise-soft text-sk-turquoise",
    ring: "border-sk-turquoise/40",
    swatch: "bg-sk-turquoise",
  },
  orange: {
    label: "Orange",
    chip: "bg-sk-orange-soft text-sk-orange",
    ring: "border-sk-orange/40",
    swatch: "bg-sk-orange",
  },
  green: {
    label: "Green",
    chip: "bg-sk-green-soft text-sk-green",
    ring: "border-sk-green/40",
    swatch: "bg-sk-green",
  },
  danger: {
    label: "Alert",
    chip: "bg-destructive/10 text-destructive",
    ring: "border-destructive/40",
    swatch: "bg-destructive",
  },
  muted: {
    label: "Neutral",
    chip: "bg-muted text-muted-foreground",
    ring: "border-border",
    swatch: "bg-muted-foreground",
  },
} as const;

export type BriefColourName = keyof typeof BRIEF_COLOURS;

export const BRIEF_COLOUR_NAMES = Object.keys(BRIEF_COLOURS) as BriefColourName[];

export function briefColour(name: string | null | undefined) {
  return BRIEF_COLOURS[(name as BriefColourName) ?? "muted"] ?? BRIEF_COLOURS.muted;
}
