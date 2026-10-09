import { resolveRange, type DateRange, type RangePreset } from "../finance/dates";
import type { UserSettings } from "../data/workspace";

const PRESETS = new Set(["today", "week", "month", "year", "all", "custom"]);

export function rangeFromParams(params: Record<string, string>, settings: UserSettings, fallback: RangePreset = "all"): DateRange {
  const preset = (PRESETS.has(params.range ?? "") ? params.range : fallback) as RangePreset;
  return resolveRange(preset, settings.timezone, settings.weekStartsOn, { from: params.from, to: params.to });
}
