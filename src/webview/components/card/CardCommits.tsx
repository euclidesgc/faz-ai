import { useMemo } from 'react';
import { groupCommitsByPhase } from '../../../shared/commits';
import { t } from '../../i18n';
import { useCardCommits } from './useCardCommits';

/** Commits da branch da história, um grupo por fase. Some se não há commits, carrega ou falha. */
export function CardCommits({ cardId, branch }: { cardId: string; branch: string | null | undefined }) {
  const commits = useCardCommits(cardId, branch);
  const groups = useMemo(() => groupCommitsByPhase(commits), [commits]);
  if (groups.length === 0) return null;

  return (
    <section className="card-commits" aria-label={t('Commits por fase')}>
      <h3 className="card-commits-title">{t('Commits por fase')}</h3>
      {groups.map((group) => (
        <div key={group.phase || '__none'} className="card-commits-group">
          <h4 className="card-commits-phase">{group.phase || t('Sem fase')}</h4>
          <ul>
            {group.commits.map((c) => (
              <li key={c.hash}>
                <code>{c.hash}</code> <span>{c.subject}</span>{' '}
                <time className="muted small" dateTime={c.date}>
                  {new Date(c.date).toLocaleString()}
                </time>
                {c.card && (
                  <span className="muted small" title={t('Card')}>
                    {' '}
                    {c.card.startsWith('#') ? c.card : `#${c.card}`}
                  </span>
                )}
                {c.run && (
                  <span className="muted small" title={t('Run')}>
                    {' '}
                    {t('Run')} {c.run.slice(0, 8)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
