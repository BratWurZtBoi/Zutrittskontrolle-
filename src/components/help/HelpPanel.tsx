import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { searchTopics, topicsForPath, type HelpRole } from '../../domain/help';
import { HELP_TOPICS } from '../../help/topics';
import { HelpTopicList, HelpTopicView } from './HelpContent';

/** Schmale Bildschirme: das Hilfefenster deckt die Seite ab → nach einem Link schließen. */
export const HELP_NARROW_QUERY = '(max-width: 1199.98px)';
export function helpCoversPage(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(HELP_NARROW_QUERY).matches;
}

/**
 * „?“-Hilfe: Seitenleiste mit den Themen zur aktuellen Seite, Suche und Link zu allen Themen.
 * Bleibt auf breiten Bildschirmen neben der Seite offen (zum Mitmachen), auf schmalen deckt sie die Seite ab.
 */
export function HelpPanel({ path, role, onClose }: { path: string; role: HelpRole; onClose: () => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const forPage = useMemo(() => topicsForPath(HELP_TOPICS, path, role), [path, role]);
  const results = useMemo(() => (query.trim() ? searchTopics(HELP_TOPICS, query, role) : null), [query, role]);
  const topic = topicId ? HELP_TOPICS.find((t) => t.id === topicId) : undefined;

  // Beim Öffnen und beim Wechsel Thema ↔ Liste: Fokus auf die Überschrift (ohne Bildschirmtastatur auf dem Handy)
  useEffect(() => {
    headingRef.current?.focus();
  }, [topicId]);

  const afterLink = () => {
    if (helpCoversPage()) onClose();
  };

  return (
    <aside
      className="help-panel no-print"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        // Tasten nicht an Kurzbefehle der Seite weitergeben (z. B. Enter/Esc = Einlassen/Abweisen)
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          if (topic) setTopicId(null);
          else onClose();
        }
      }}
    >
      <header className="help-panel-head">
        {topic ? (
          <button type="button" className="btn btn-small btn-ghost help-back" onClick={() => setTopicId(null)}>
            ← Zurück
          </button>
        ) : null}
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
          {topic ? topic.title : 'Hilfe'}
        </h2>
        <button type="button" className="help-close" aria-label="Hilfe schließen" title="Hilfe schließen (Esc)" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="help-panel-body">
        {topic ? (
          <HelpTopicView topic={topic} role={role} currentPath={path} onLink={afterLink} />
        ) : (
          <>
            <input
              type="search"
              className="help-search"
              placeholder="Hilfe durchsuchen, z. B. „Backup“ …"
              aria-label="Hilfe durchsuchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results ? (
              <>
                <h3 className="help-section-title">{results.length === 0 ? 'Nichts gefunden' : `${results.length} Treffer`}</h3>
                {results.length === 0 ? (
                  <p className="muted">Andere Wörter versuchen oder alle Themen ansehen.</p>
                ) : (
                  <HelpTopicList topics={results} onSelect={setTopicId} />
                )}
              </>
            ) : (
              <>
                <h3 className="help-section-title">{forPage.length > 0 ? 'Zu dieser Seite' : 'Zu dieser Seite gibt es noch keine Hilfe'}</h3>
                {forPage.length > 0 && <HelpTopicList topics={forPage} onSelect={setTopicId} />}
              </>
            )}
          </>
        )}
      </div>
      <footer className="help-panel-foot">
        <Link to={topic ? `/hilfe?thema=${topic.id}` : '/hilfe'} onClick={afterLink}>
          {topic ? 'Als Seite öffnen' : 'Alle Hilfethemen'} →
        </Link>
      </footer>
    </aside>
  );
}
