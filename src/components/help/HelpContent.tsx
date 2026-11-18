import { Link } from 'react-router';
import { emphasisParts, type HelpRole, type HelpTopic } from '../../domain/help';
import { isStaffPath } from '../../lib/roles';

/** Text mit **fetten** Beschriftungen der App. */
export function HelpText({ text }: { text: string }) {
  return (
    <>
      {emphasisParts(text).map((p, i) => (p.strong ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/**
 * Ein Thema: nummerierte Schritte, Direktlinks zur Seite (nur wenn die Rolle sie öffnen darf und man nicht schon
 * dort ist), Tipps.
 */
export function HelpTopicView({ topic, role, currentPath, onLink }: { topic: HelpTopic; role: HelpRole; currentPath?: string; onLink?: () => void }) {
  const canOpen = (to: string) => to !== currentPath && (role === 'admin' || isStaffPath(to));
  return (
    <article className="help-topic" aria-label={topic.title}>
      <p className="help-summary">{topic.summary}</p>
      <ol className="help-steps">
        {topic.steps.map((step, i) => (
          <li key={i}>
            <HelpText text={step.text} />
            {step.link && canOpen(step.link.to) && (
              <>
                {' '}
                <Link className="help-step-link" to={step.link.to} onClick={onLink}>
                  {step.link.label} →
                </Link>
              </>
            )}
          </li>
        ))}
      </ol>
      {topic.tips && topic.tips.length > 0 && (
        <div className="help-tips">
          <strong>Tipp{topic.tips.length > 1 ? 's' : ''}</strong>
          <ul>
            {topic.tips.map((tip, i) => (
              <li key={i}>
                <HelpText text={tip} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** Liste von Themen zum Antippen (Titel + kurze Beschreibung). */
export function HelpTopicList({ topics, onSelect }: { topics: HelpTopic[]; onSelect: (id: string) => void }) {
  return (
    <ul className="help-list">
      {topics.map((t) => (
        <li key={t.id}>
          <button type="button" className="help-list-item" onClick={() => onSelect(t.id)}>
            <span className="help-list-title">{t.title}</span>
            <span className="help-list-summary">{t.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
