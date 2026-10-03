import type { LogEntry } from "./types";

export type LogCategory = "rolls" | "builds" | "trades" | "robber" | "cards" | "awards" | "other";
export type LogFilter = "all" | Exclude<LogCategory, "other">;

export const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rolls", label: "Rolls" },
  { id: "builds", label: "Builds" },
  { id: "trades", label: "Trades" },
  { id: "robber", label: "Robber" },
  { id: "cards", label: "Cards" },
  { id: "awards", label: "Awards" },
];

/** Which filter bucket a log line belongs to. Income lines ("gained", "received") count as part of the roll. */
export function logCategory(entry: LogEntry): LogCategory {
  const t = entry.text;
  switch (entry.kind) {
    case "roll": return "rolls";
    case "build": return "builds";
    case "trade": return "trades";
    case "robber": return "robber";
    case "dev": return "cards";
    case "achievement": return "awards";
    case "info":
      if (t.includes("Longest Trail") || t.includes("Largest Host")) return "awards";
      if (t.includes(" gained ") || t.includes(" received ") || t.includes("doesn't have enough")) return "rolls";
      return "other";
    default: return "other";
  }
}

export function isSevenRoll(entry: LogEntry): boolean {
  return entry.kind === "roll" && /= 7$/.test(entry.text);
}
