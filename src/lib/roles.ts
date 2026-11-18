/** Welche Seiten der Bediener (PIN) öffnen darf – alles andere nur der Admin. */
const STAFF_PATHS = ['/dashboard', '/auswertung', '/uebersicht', '/notfallliste', '/hilfe'];

export function isStaffPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? '';
  return STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
