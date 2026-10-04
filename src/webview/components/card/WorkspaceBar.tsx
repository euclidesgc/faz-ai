import { useEffect, useState } from 'react';
import type { Card } from '../../../shared/model';
import { storyOf } from '../../../shared/story';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { Button, IconBranch, IconCheck, IconExternal, IconPr } from '../ui';
import { t } from '../../i18n';

/** Branch, pasta de trabalho e PR do card. São da história: a sub-tarefa mostra as do pai. */
export function WorkspaceBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const mode = state.board.git.mode;
  const [copied, setCopied] = useState(false);
  // o "Copiado" some sozinho, para o botão voltar a dizer o que o clique faz
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (card.deletedAt !== null || mode === 'off') return null;
  const story = storyOf(state, card) ?? card;

  return (
    <div className="drawer-workspace">
      {story.branch ? (
        <>
          <Button
            variant="ghost"
            size="small"
            className="branch-copy"
            title={t('Copiar o nome da branch')}
            onClick={() => {
              const branch = story.branch!;
              void navigator.clipboard?.writeText(branch).then(() => setCopied(true));
            }}
          >
            <IconBranch /> <code>{story.branch}</code>
          </Button>
          <span className="branch-copied" role="status">
            {copied && (
              <>
                <IconCheck /> {t('Nome copiado')}
              </>
            )}
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
