/** Colour theme preference, stored in a cookie so the server renders the right theme with no flash. */
export const THEME_COOKIE = "pbp_theme";
export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "dark";
}
