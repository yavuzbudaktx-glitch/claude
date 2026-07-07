import {
  Briefcase,
  Dumbbell,
  Heart,
  BellRing,
  Frown,
  Smile,
  Moon,
  UtensilsCrossed,
  Car,
  MessageCircleHeart,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { TeaBag } from "@/components/zuya/TeaBagIcon";

// Both lucide icons and our custom TeaBag satisfy this — they all take a
// className and an optional inline style (which the badge uses to size them).
type StatusIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

export interface ZuyaStatus {
  slug: string;
  icon: StatusIcon;
  en: string;
  tr: string;
  /** Chip/badge tint. */
  color: string;
}

// The preset status list. `tr` is what renders prominently — English is the
// UI language, but statuses are where the Turkish touches live.
export const ZUYA_STATUSES: ZuyaStatus[] = [
  { slug: "free",         icon: MessageCircleHeart, en: "Free to talk",    tr: "Konuşabilirim",    color: "#2e9e6b" },
  { slug: "working",      icon: Briefcase,          en: "Working",         tr: "Çalışıyorum",      color: "#5b7a99" },
  { slug: "gym",          icon: Dumbbell,           en: "At the gym",      tr: "Spordayım",        color: "#c07a2d" },
  { slug: "thinking",     icon: Heart,              en: "Thinking of you", tr: "Seni düşünüyorum", color: "#d64570" },
  { slug: "attention",    icon: BellRing,           en: "Needs attention", tr: "İlgi bekliyorum",  color: "#c2452d" },
  { slug: "happy",        icon: Smile,              en: "Happy",           tr: "Mutluyum",         color: "#d4a017" },
  { slug: "sad",          icon: Frown,              en: "Sad",             tr: "Üzgünüm",          color: "#6b7280" },
  { slug: "sleeping",     icon: Moon,               en: "Sleeping",        tr: "Uyuyorum",         color: "#7c6bd6" },
  { slug: "eating",       icon: UtensilsCrossed,    en: "Eating",          tr: "Yemekteyim",       color: "#a8743d" },
  { slug: "driving",      icon: Car,                en: "Driving",         tr: "Yoldayım",         color: "#4b8a8f" },
  { slug: "brewing",      icon: TeaBag,             en: "Making tea",      tr: "Demleniyor",       color: "#9c6b3f" },
];

export function zuyaStatus(slug: string): ZuyaStatus {
  return ZUYA_STATUSES.find((s) => s.slug === slug) ?? ZUYA_STATUSES[0];
}
