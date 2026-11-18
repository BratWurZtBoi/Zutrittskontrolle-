import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { HelpTopicList, HelpTopicView } from '../components/help/HelpContent';
import { HELP_CATEGORIES, searchTopics, visibleTopics, type HelpRole } from '../domain/help';
import { HELP_TOPICS } from '../help/topics';
import { useSecurity } from '../security/useSecurity';

/** Alle Hilfethemen nach Bereichen, mit Suche; ?thema=… zeigt ein Thema, ?suche=… die Treffer. */
export function HelpPage() {
  const security = useSecurity();
  const role: HelpRole = security.admin ? 'admin' : 'operator';
  const [params, setParams] = useSearchParams();
  const query = params.get('suche') ?? '';
  const topics = useMemo(() => visibleTopics(HELP_TOPICS, role), [role]);
  const topic = topics.find((t) => t.id === params.get('thema'));
  const results = useMemo(() => (query.trim() ? searchTopics(HELP_TOPICS, query, role) : null), [query, role]);
  const select = (id: string) => {
    setParams({ thema: id });
    window.scrollTo(0, 0);
  };

  if (topic) {
    const category = HELP_CATEGORIES.find((c) => c.id === topic.category);
    return (
      <div className="page help-page">
        <p className="help-crumbs">
          <Link to="/hilfe">← Alle Hilfethemen</Link>
          {category && <span className="muted"> · {category.title}</span>}
        </p>
        <h1>{topic.title}</h1>
        <HelpTopicView topic={topic} role={role} />
      </div>
    );
  }

  return (
    <div className="page help-page">
      <header className="page-header">
        <h1>Hilfe</h1>
      </header>
      <p className="muted">
        Anleitungen Schritt für Schritt. <strong>Fett</strong> geschrieben sind die Beschriftungen in der App. Tipp: Das
        <strong> ?</strong> oben im Menü zeigt die Hilfe zur gerade geöffneten Seite.
        {role === 'operator' && ' Angezeigt werden die Themen für den Empfang.'}
      </p>
      <input
        type="search"
        className="help-search"
        placeholder="Hilfe durchsuchen, z. B. „Besucher“, „Notfall“, „Backup“ …"
        aria-label="Hilfe durchsuchen"
        value={query}
        onChange={(e) => setParams(e.target.value ? { suche: e.target.value } : {}, { replace: true })}
      />
      {results ? (
        <section className="help-category">
          <h2>{results.length === 0 ? 'Nichts gefunden' : `${results.length} Treffer`}</h2>
          {results.length === 0 ? <p className="muted">Andere Wörter versuchen.</p> : <HelpTopicList topics={results} onSelect={select} />}
        </section>
      ) : (
        <div className="help-categories">
          {HELP_CATEGORIES.map((c) => {
            const list = topics.filter((t) => t.category === c.id);
            if (list.length === 0) return null;
            return (
              <section key={c.id} className="help-category">
                <h2>{c.title}</h2>
                <HelpTopicList topics={list} onSelect={select} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
