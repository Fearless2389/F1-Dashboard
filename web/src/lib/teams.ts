/**
 * Team color resolution — single source of truth, mirrors src/dashboard/app.py.
 * `teamColor("Red Bull Racing Honda")` → "#3671C6".
 */

const TEAM_COLORS: Array<[string, string]> = [
  ["red bull",       "#3671C6"],
  ["mclaren",        "#FF8000"],
  ["ferrari",        "#E8002D"],
  ["mercedes",       "#27F4D2"],
  ["aston martin",   "#229971"],
  ["alpine",         "#FF87BC"],
  ["haas",           "#B6BABD"],
  ["racing bulls",   "#6692FF"],
  ["rb ",            "#6692FF"],
  ["williams",       "#64C4FF"],
  ["audi",           "#00B7E5"],
  ["cadillac",       "#7A1E1E"],
  ["kick sauber",    "#52E252"],
  ["sauber",         "#52E252"],
  ["alfa romeo",     "#900000"],
  ["alphatauri",     "#5E8FAA"],
];

export function teamColor(name: string | null | undefined): string {
  if (!name) return "#38383f";
  const lower = name.toLowerCase();
  for (const [needle, color] of TEAM_COLORS) {
    if (lower.includes(needle)) return color;
  }
  return "#38383f";
}

export function teamColorFallback(provided?: string | null, name?: string | null): string {
  return provided ?? teamColor(name);
}

export const TEAM_PALETTE = TEAM_COLORS;
