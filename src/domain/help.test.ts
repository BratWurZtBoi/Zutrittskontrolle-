import { describe, expect, it } from 'vitest';
import { HELP_TOPICS } from '../help/topics';
import { SETTINGS_SECTIONS } from '../pages/settings/SettingsShell';
import { emphasisParts, searchTopics, topicsForPath, visibleTopics, type HelpTopic } from './help';

const t = (id: string, pages: string[], audience: HelpTopic['audience'] = 'all', extra: Partial<HelpTopic> = {}): HelpTopic => ({
  id,
  title: id,
  category: 'start',
  audience,
  pages,
  summary: '',
  steps: [{ text: 'Schritt' }],
  ...extra,
});

/** Seiten der App (Routen in App.tsx bzw. SETTINGS_SECTIONS), auf die Hilfetexte verlinken dürfen. */
const KNOWN_PAGES = [
  '/dashboard',
  '/auswertung',
  '/notfallliste',
  '/anmelden',
  '/einrichtung',
  '/erste-schritte',
  '/karten',
  '/karten/neu',
  '/karten/import',
  '/druck',
  '/veranstaltungen',
  '/einstellungen',
  ...SETTINGS_SECTIONS.map((s) => s.path),
];

describe('Hilfe', () => {
  const topics = [t('karten', ['/karten']), t('karte', ['/karten/neu'], 'admin'), t('start', ['/']), t('dashboard', ['/dashboard'])];

  it('passende Themen zur Seite, genaueste zuerst, „/“ nur exakt', () => {
    expect(topicsForPath(topics, '/karten/neu', 'admin').map((x) => x.id)).toEqual(['karte', 'karten']);
    expect(topicsForPath(topics, '/kartenlayout', 'admin')).toEqual([]);
    expect(topicsForPath(topics, '/', 'admin').map((x) => x.id)).toEqual(['start']);
    expect(topicsForPath(topics, '/dashboard', 'admin').map((x) => x.id)).toEqual(['dashboard']);
  });

  it('Bediener sehen nur Themen für alle', () => {
    expect(visibleTopics(topics, 'operator').map((x) => x.id)).toEqual(['karten', 'start', 'dashboard']);
    expect(topicsForPath(topics, '/karten/neu', 'operator').map((x) => x.id)).toEqual(['karten']);
  });

  it('Suche: alle Wörter, Umlaute egal, Titel-Treffer zuerst', () => {
    const list = [t('a', [], 'all', { title: 'Backup', summary: 'Daten sichern' }), t('b', [], 'all', { title: 'Drucken', steps: [{ text: 'Vorher ein **Backup** erstellen' }] })];
    expect(searchTopics(list, 'backup', 'admin').map((x) => x.id)).toEqual(['a', 'b']);
    expect(searchTopics(list, 'daten sichern', 'admin').map((x) => x.id)).toEqual(['a']);
    expect(searchTopics([t('c', [], 'all', { title: 'Gästebildschirm' })], 'gaeste', 'admin').map((x) => x.id)).toEqual(['c']);
  });

  it('fette Beschriftungen', () => {
    expect(emphasisParts('Auf **Speichern** tippen')).toEqual([
      { text: 'Auf ', strong: false },
      { text: 'Speichern', strong: true },
      { text: ' tippen', strong: false },
    ]);
  });

  it('Inhalte: eindeutige IDs, jedes Thema mit Schritten, Links auf echte Seiten', () => {
    const ids = HELP_TOPICS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of HELP_TOPICS) {
      expect(topic.steps.length, topic.id).toBeGreaterThan(0);
      for (const s of topic.steps) {
        expect(s.text.split('**').length % 2, `${topic.id}: ungerade Anzahl **`).toBe(1);
        if (s.link) expect(KNOWN_PAGES, `${topic.id}: Link ${s.link.to}`).toContain(s.link.to);
      }
      for (const page of topic.pages) expect(page === '/' || KNOWN_PAGES.some((k) => k === page || k.startsWith(`${page}/`)), `${topic.id}: Seite ${page}`).toBe(true);
    }
    // Jede Seite der Bedienung hat Hilfe (Admin)
    for (const page of [...KNOWN_PAGES, '/karten/abc123', '/veranstaltungen/abc123']) {
      expect(topicsForPath(HELP_TOPICS, page, 'admin').length, page).toBeGreaterThan(0);
    }
    // Bediener finden Hilfe zu ihren Seiten
    expect(topicsForPath(HELP_TOPICS, '/dashboard', 'operator').length).toBeGreaterThan(3);
    expect(topicsForPath(HELP_TOPICS, '/einstellungen/datensicherung', 'operator')).toEqual([]);
  });
});
