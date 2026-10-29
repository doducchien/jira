export type TimeConfig = {
  hoursPerDay: number;
  daysPerWeek: number;
  defaultUnit: "minute" | "hour" | "day" | "week";
};

export const DEFAULT_TIME_CONFIG: TimeConfig = {
  hoursPerDay: 8,
  daysPerWeek: 5,
  defaultUnit: "minute",
};

function unitSeconds(cfg: TimeConfig): Record<string, number> {
  const day = cfg.hoursPerDay * 3600;
  return { w: day * cfg.daysPerWeek, d: day, h: 3600, m: 60 };
}

/**
 * Parses Jira duration syntax ("2w 4d 6h 45m", "1.5h", "90") into seconds.
 * A bare number uses Jira's configured default unit. Returns null when invalid.
 */
export function parseDuration(input: string, cfg: TimeConfig): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  const units = unitSeconds(cfg);
  if (/^\d+(\.\d+)?$/.test(s)) {
    const key = { minute: "m", hour: "h", day: "d", week: "w" }[cfg.defaultUnit];
    return Math.round((parseFloat(s) * units[key]) / 60) * 60;
  }
  const re = /(\d+(?:\.\d+)?)\s*([wdhm])/g;
  let total = 0;
  let consumed = "";
  for (const m of s.matchAll(re)) {
    total += parseFloat(m[1]) * units[m[2]];
    consumed += m[0];
  }
  if (consumed.replace(/\s+/g, "") !== s.replace(/\s+/g, "")) return null;
  return Math.round(total / 60) * 60;
}

/** Formats seconds the way Jira does: "1w 2d 3h 30m". */
export function formatDuration(seconds: number | null | undefined, cfg: TimeConfig): string {
  if (!seconds || seconds <= 0) return "0m";
  let minutes = Math.round(seconds / 60);
  const perDay = Math.round(cfg.hoursPerDay * 60);
  const perWeek = perDay * cfg.daysPerWeek;
  const parts: string[] = [];
  for (const [unit, size] of [
    ["w", perWeek],
    ["d", perDay],
    ["h", 60],
  ] as const) {
    const n = Math.floor(minutes / size);
    if (n) parts.push(`${n}${unit}`);
    minutes -= n * size;
  }
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ");
}

/** Compact hours for grids: "7.5h". */
export function formatHours(seconds: number): string {
  if (!seconds) return "";
  return `${Number((seconds / 3600).toFixed(2))}h`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

/** Monday-based week start. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Jira returns "2021-01-17T12:34:00.000+0000", which Safari can't parse without a colon in the offset. */
export function parseJiraDate(s: string): Date {
  return new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/** Jira expects "yyyy-MM-dd'T'HH:mm:ss.SSSZ" with a "+0700"-style offset. */
export function toJiraDateTime(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000${sign}${pad(
    Math.floor(abs / 60),
  )}${pad(abs % 60)}`;
}

export function toDateTimeLocal(d: Date): string {
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(d: Date | string): string {
  return dateFmt.format(typeof d === "string" ? parseJiraDate(d) : d);
}

export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(typeof d === "string" ? parseJiraDate(d) : d);
}
