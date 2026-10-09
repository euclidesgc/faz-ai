import { cardRef } from '../../shared/model';
import { archivedIn } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { formatDateTime, t, tn, dt } from '../i18n';
import { requestRestoreArchived } from '../store/actions';
import { CardView } from './Card';
import { Button } from './ui';

/**
 * Aba Arquivados: uma linha por workflow, na ordem do board, só com os cards arquivados dele (do mais recente ao
 * mais antigo). Preserva o histórico sem ocupar as linhas do board; restaurar devolve o card à primeira coluna.
 */
export function ArchivedView() {
  const state = useBoardStore((s) => s.state)!;
  const workflows = state.workflows.slice().sort((a, b) => a.position - b.position);

  return (
    <div className="archived">
      <div className="row">
        <h2>{t('Arquivados')}</h2>
      </div>
      <p className="muted">
        {t(
          'Cards arquivados ficam aqui, por workflow, do mais recente ao mais antigo. Restaurar leva o card para a primeira coluna do workflow dele.',
        )}
      </p>
      {workflows.map((wf) => {
        const cards = archivedIn(state, wf.id);
        return (
          <section key={wf.id} className="archived-row" aria-label={dt(wf.name)}>
            <header>
              <h2>{dt(wf.name)}</h2>
              <span className="column-count">{tn(cards.length, '{n} card', '{n} cards')}</span>
            </header>
            {cards.length === 0 ? (
              <p className="muted small">{t('Nenhum card arquivado neste workflow.')}</p>
            ) : (
              <div className="archived-cards">
                {cards.map((card) => (
                  <div key={card.id} className="archived-item">
                    <CardView card={card} />
                    <div className="archived-meta">
                      <span>{formatDateTime(card.archivedAt!)}</span>
                      <span className="spacer" />
                      <Button
                        title={t('Restaurar {title}', { title: `${cardRef(card)} ${card.title}` })}
                        aria-label={t('Restaurar {title}', { title: `${cardRef(card)} ${card.title}` })}
                        onClick={() => requestRestoreArchived(card.id)}
                      >
                        {t('Restaurar')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
