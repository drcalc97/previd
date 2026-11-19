// Display helpers. Clinical dates are always shown in UK time with an unambiguous format.
const TZ = "Europe/London";

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(iso));

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: TZ }).format(new Date(iso));

/** DOB comes from a date column (no time zone): format without shifting. */
export const formatDob = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};

export function ageFromDob(ymd: string, now = new Date()): number {
  const [y, m, d] = ymd.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

export const formatNhs = (n: string | null) => (n ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : "—");

export function formatDuration(sec: number | null) {
  if (sec === null) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function daysAgo(iso: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
