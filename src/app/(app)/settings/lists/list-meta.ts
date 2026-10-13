import type { ListKind } from "@/lib/data/settings";

export const LIST_META: Record<ListKind, { label: string; one: string; empty: string }> = {
  venues: { label: "Venues", one: "venue", empty: "Casinos, card rooms and home games you play at." },
  platforms: { label: "Online sites", one: "site", empty: "Online poker sites and apps." },
  game_types: { label: "Games", one: "game", empty: "Hold'em, Omaha and the other games you play." },
  stake_levels: { label: "Stakes", one: "stake", empty: "Blind levels for cash games, e.g. 1/2 or 0.25/0.50." },
  expense_categories: { label: "Expense categories", one: "category", empty: "Groups for travel, food, coaching and other costs." },
};

export const VENUE_KINDS: Record<string, string> = { casino: "Casino", card_room: "Card room", private_club: "Private club", home: "Home game", other: "Other" };
export const BETTING: Record<string, string> = { no_limit: "No limit", pot_limit: "Pot limit", fixed_limit: "Fixed limit", spread_limit: "Spread limit", mixed: "Mixed", other: "Other" };
export const EXPENSE_KINDS: Record<string, string> = {
  travel: "Travel",
  accommodation: "Accommodation",
  food: "Food",
  parking: "Parking",
  coaching: "Coaching",
  training: "Training",
  software: "Software",
  equipment: "Equipment",
  membership: "Membership",
  other: "Other",
};
