import { intentCategories, type IntentCategory } from "./domain";

export type ParsedQuickEdit = {
  raw: string;
  reminder?: {
    triggerType: "specific_time" | "relative_time";
    triggerValue: string;
    dueAt: string | null;
    rationale: string;
  };
  intent?: IntentCategory;
  collectionName?: string;
  remainingText: string;
};

const intentAliases: Array<{ pattern: RegExp; intent: IntentCategory }> = [
  { pattern: /\bwatch\b|\bwatch later\b/i, intent: "watch_later" },
  { pattern: /\bread\b|\bread later\b/i, intent: "read_later" },
  { pattern: /\btry\b|\btry place\b|\brestaurant\b|\bplace\b/i, intent: "try_place" },
  { pattern: /\bbuy\b|\bbuy later\b|\bpurchase\b/i, intent: "buy_later" },
  { pattern: /\bcook\b|\bmake\b|\brecipe\b/i, intent: "cook_or_make" },
  { pattern: /\bsend\b|\bshare\b/i, intent: "send_or_share" },
  { pattern: /\btrip\b|\bevent\b|\bplan\b/i, intent: "plan_trip_or_event" },
  { pattern: /\bcompare\b|\bresearch\b/i, intent: "compare_or_research" },
  { pattern: /\breference\b|\buse as reference\b/i, intent: "use_as_reference" },
  { pattern: /\bremember\b|\bfact\b/i, intent: "remember_fact" },
  { pattern: /\breview\b|\breview later\b/i, intent: "review_later" }
];

function addToDate(date: Date, unit: string, count: number) {
  const next = new Date(date);
  if (unit === "m") next.setMinutes(next.getMinutes() + count);
  if (unit === "h") next.setHours(next.getHours() + count);
  if (unit === "d") next.setDate(next.getDate() + count);
  if (unit === "w") next.setDate(next.getDate() + count * 7);
  return next;
}

function applyClock(base: Date, clock: string) {
  const match = clock.match(/@?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return base;
  const next = new Date(base);
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function parseReminder(raw: string, now: Date) {
  const relative = raw.match(/\b(\d{1,3})\s*([mhdw])\b/i);
  const clock = raw.match(/@\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i);
  const tomorrow = /\btom(?:orrow)?\b/i.test(raw);
  const nextWeek = /\bnext\s+week\b/i.test(raw);

  if (relative) {
    let dueAt = addToDate(now, relative[2].toLowerCase(), Number(relative[1]));
    if (clock) dueAt = applyClock(dueAt, clock[0]);
    return {
      triggerType: "relative_time" as const,
      triggerValue: [relative[0], clock?.[0]].filter(Boolean).join(" "),
      dueAt: dueAt.toISOString(),
      rationale: `Resurface this capture ${relative[0]} from now.`
    };
  }

  if (tomorrow || nextWeek || clock) {
    let dueAt = new Date(now);
    if (tomorrow) dueAt.setDate(dueAt.getDate() + 1);
    if (nextWeek) dueAt.setDate(dueAt.getDate() + 7);
    if (clock) dueAt = applyClock(dueAt, clock[0]);
    return {
      triggerType: "specific_time" as const,
      triggerValue: [tomorrow ? "tomorrow" : nextWeek ? "next week" : null, clock?.[0]]
        .filter(Boolean)
        .join(" ") || "specific time",
      dueAt: dueAt.toISOString(),
      rationale: "Resurface this capture at the requested time."
    };
  }

  return null;
}

function parseIntent(raw: string) {
  const canonical = intentCategories.find((intent) =>
    new RegExp(`\\b${intent.replace(/_/g, "[ _-]?")}\\b`, "i").test(raw)
  );
  if (canonical) return canonical;
  return intentAliases.find((alias) => alias.pattern.test(raw))?.intent ?? null;
}

function parseCollection(raw: string) {
  const hash = raw.match(/#([\p{L}\p{N}][\p{L}\p{N} _-]{1,48})/u);
  if (hash) return hash[1].trim();

  const collection = raw.match(/\b(?:add to|collection|project|trip)\s+([\p{L}\p{N}][\p{L}\p{N} _-]{1,48})/iu);
  return collection?.[1]?.trim() ?? null;
}

export function parseQuickEdit(raw: string, options: { now?: Date } = {}): ParsedQuickEdit {
  const trimmed = raw.trim();
  const reminder = parseReminder(trimmed, options.now ?? new Date()) ?? undefined;
  const intent = parseIntent(trimmed) ?? undefined;
  const collectionName = parseCollection(trimmed) ?? undefined;

  let remainingText = trimmed;
  if (reminder?.triggerValue) {
    for (const part of reminder.triggerValue.split(/\s+/)) {
      remainingText = remainingText.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "");
    }
  }
  if (intent) {
    remainingText = remainingText.replace(new RegExp(intent.replace(/_/g, "[ _-]?"), "i"), "");
  }
  if (collectionName) {
    remainingText = remainingText
      .replace(`#${collectionName}`, "")
      .replace(new RegExp(`\\b(add to|collection|project|trip)\\s+${collectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu"), "");
  }

  return {
    raw: trimmed,
    reminder,
    intent,
    collectionName,
    remainingText: remainingText.replace(/\s+/g, " ").trim()
  };
}
