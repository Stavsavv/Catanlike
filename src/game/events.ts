import type { LogEntry, Player } from "./types";

export type EventIcon = "skull" | "castle" | "crown" | "swords" | "gift" | "coins" | "route" | "alert";

/** A big moment worth a banner on screen. */
export interface GameEvent {
  id: number;
  title: string;
  subtitle: string;
  tone: "gold" | "danger" | "info";
  icon: EventIcon;
  playerId?: string;
}

/** Decide whether a log entry deserves a banner. Routine moves (roads, settlements, normal rolls) return null. */
export function classifyEvent(entry: LogEntry, players: Player[], humanId: string): GameEvent | null {
  const who = players.find((p) => p.id === entry.playerId);
  const name = who?.name ?? "Someone";
  const text = entry.text;
  const base = { id: entry.id, playerId: entry.playerId };

  if (entry.kind === "roll" && /= 7$/.test(text)) {
    return { ...base, title: "7 rolled!", subtitle: `${name} rolled a 7. Lords holding more than 7 cards discard half, then the robber moves.`, tone: "danger", icon: "skull" };
  }
  if (entry.kind === "build" && text.includes("upgraded to a city")) {
    return { ...base, title: "City built", subtitle: `${name} upgraded a settlement to a city (+1 VP, double income).`, tone: "gold", icon: "castle" };
  }
  if (entry.kind === "achievement") {
    const n = text.match(/\((\d+)\)/)?.[1];
    if (text.includes("Longest Trail")) {
      return { ...base, title: "Longest Trail!", subtitle: `${name} takes it with a road of ${n} (+2 VP).`, tone: "gold", icon: "route" };
    }
    if (text.includes("Largest Host")) {
      return { ...base, title: "Largest Host!", subtitle: `${name} commands it with ${n} Knights (+2 VP).`, tone: "gold", icon: "swords" };
    }
    return null; // the victory screen covers "has won"
  }
  if (entry.kind === "info" && text.includes("lost the Longest Trail")) {
    return { ...base, title: "Longest Trail lost", subtitle: text, tone: "info", icon: "route" };
  }
  if (entry.kind === "info" && text.includes("doesn't have enough")) {
    return { ...base, title: "Bank shortage", subtitle: text, tone: "info", icon: "alert" };
  }
  if (entry.kind === "robber" && text.includes("(Knight)")) {
    return { ...base, title: "Knight played!", subtitle: text.replace(" (Knight)", ""), tone: "danger", icon: "swords" };
  }
  if (entry.kind === "robber" && text.includes(" stole 1 card from ")) {
    const human = players.find((p) => p.id === humanId);
    if (human && text.endsWith(` from ${human.name}`) && entry.playerId !== humanId) {
      return { ...base, title: "Robbed!", subtitle: `${name} stole a card from you.`, tone: "danger", icon: "skull" };
    }
    return null;
  }
  if (entry.kind === "dev") {
    if (text.includes("played Bounty")) return { ...base, title: "Bounty played", subtitle: text, tone: "info", icon: "gift" };
    if (text.includes("played Royal Decree")) return { ...base, title: "Royal Decree!", subtitle: text, tone: "danger", icon: "coins" };
    if (text.includes("played Surveyors")) return { ...base, title: "Surveyors played", subtitle: text, tone: "info", icon: "route" };
  }
  return null;
}
