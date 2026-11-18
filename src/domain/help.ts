/**
 * Integrierte Hilfe: Themen mit Schritt-für-Schritt-Anleitungen, passend zur aktuellen Seite
 * und zur Rolle (Admin sieht alles, Bediener nur Empfangs-Themen). Reine Funktionen.
 */

export type HelpRole = 'admin' | 'operator';

export interface HelpStep {
  /** Text; **fett** markiert Beschriftungen in der App (Knöpfe, Reiter, Felder). */
  text: string;
  /** Optional: direkt zur passenden Seite. */
  link?: { to: string; label: string };
}

export interface HelpTopic {
  id: string;
  title: string;
  category: HelpCategory;
  /** 'all' = auch für Bediener; 'admin' = nur Admin. */
  audience: 'all' | 'admin';
  /** Seiten, zu denen das Thema passt (Pfad-Anfang, z. B. „/karten“ passt auch zu „/karten/123“). */
  pages: string[];
  summary: string;
  steps: HelpStep[];
  tips?: string[];
  keywords?: string[];
}

export type HelpCategory = 'start' | 'reception' | 'cards' | 'events' | 'screens' | 'data';

export const HELP_CATEGORIES: { id: HelpCategory; title: string }[] = [
  { id: 'start', title: 'Erste Schritte' },
  { id: 'reception', title: 'Am Empfang' },
  { id: 'cards', title: 'Karten und Personen' },
  { id: 'events', title: 'Veranstaltungen' },
  { id: 'screens', title: 'Gästebildschirm und Geräte' },
  { id: 'data', title: 'Daten und Sicherheit' },
];

export function visibleTopics(topics: HelpTopic[], role: HelpRole): HelpTopic[] {
  return role === 'admin' ? topics : topics.filter((t) => t.audience === 'all');
}

/** Passt ein Seiten-Muster zum Pfad? „/“ nur exakt, sonst Pfad-Anfang an Segmentgrenzen. */
function matches(pattern: string, path: string): boolean {
  if (pattern === '/') return path === '/';
  return path === pattern || path.startsWith(`${pattern}/`);
}

/** Themen zur aktuellen Seite – die genauesten (längstes passendes Muster) zuerst. */
export function topicsForPath(topics: HelpTopic[], path: string, role: HelpRole): HelpTopic[] {
  const score = (t: HelpTopic) => Math.max(-1, ...t.pages.filter((p) => matches(p, path)).map((p) => p.length));
  return visibleTopics(topics, role)
    .map((t, i) => ({ t, s: score(t), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

/** Suche in Titel, Zusammenfassung, Stichwörtern und Schritten; alle Wörter müssen vorkommen. Titel-Treffer zuerst. */
export function searchTopics(topics: HelpTopic[], query: string, role: HelpRole): HelpTopic[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const list = visibleTopics(topics, role);
  if (words.length === 0) return list;
  return list
    .map((t) => {
      const title = fold(t.title);
      const text = fold([t.title, t.summary, ...(t.keywords ?? []), ...t.steps.map((s) => s.text), ...(t.tips ?? [])].join(' '));
      const all = words.every((w) => text.includes(w));
      return { t, all, inTitle: words.filter((w) => title.includes(w)).length };
    })
    .filter((x) => x.all)
    .sort((a, b) => b.inTitle - a.inTitle)
    .map((x) => x.t);
}

/** „Klicke **Speichern**“ → Abschnitte mit fett/normal. */
export function emphasisParts(text: string): { text: string; strong: boolean }[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((p) => p.text);
}
