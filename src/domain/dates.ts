/** Datumshilfen. Gültigkeitsdaten werden als lokales Datum "YYYY-MM-DD" gespeichert. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** "2026-03-01" -> "01.03.2026" */
export function formatIsoDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${formatTime(ts)}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toLocalDateString(d) === value;
}

/** Kurzform für Tabellen: heute nur Uhrzeit, sonst „14.06. 17:30“ (bzw. mit Jahr). */
export function formatShortDateTime(ts: number, now = new Date()): string {
  const d = new Date(ts);
  if (toLocalDateString(d) === toLocalDateString(now)) return formatTime(ts);
  const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  return d.getFullYear() === now.getFullYear() ? `${dm} ${formatTime(ts)}` : `${dm}${d.getFullYear()} ${formatTime(ts)}`;
}
