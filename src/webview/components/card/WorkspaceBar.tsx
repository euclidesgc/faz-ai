import type { Card } from '../../../shared/model';
import { storyOf } from '../../../shared/story';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { Button, IconBranch, IconExternal, IconPr } from '../ui';
import { t } from '../../i18n';

/** Branch, pasta de trabalho e PR do card. São da história: a sub-tarefa mostra as do pai. */
export function WorkspaceBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const mode = state.board.git.mode;
  if (card.deletedAt !== null || mode === 'off') return null;
  const story = storyOf(state, card) ?? card;

  return (
    <div className="drawer-workspace">
      {story.branch ? (
        <>
          <span title={t('Branch da história')}>
            <IconBranch /> <code>{story.branch}</code>
          </span>
          {mode === 'worktree' && story.worktreePath && (
            <Button variant="ghost" size="small" title={story.worktreePath} onClick={() => cards.openWorkspace(card.id)}>
              {t('Abrir a pasta de trabalho')}
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="ghost"
          size="small"
          title={t('Cria a branch da história e, no modo worktree, a pasta de trabalho dela')}
          onClick={() => cards.prepareWorkspace(card.id)}
        >
          {t('Criar branch da história')}
        </Button>
      )}
      {story.prUrl && (
        <a href={story.prUrl} title={story.prUrl}>
          <IconPr /> Pull request <IconExternal />
        </a>
      )}
    </div>
  );
}
