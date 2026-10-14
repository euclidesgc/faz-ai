import { useEffect, useState } from 'react';
import { cardRef, type Card } from '../../../shared/model';
import { storyOf } from '../../../shared/story';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { useAction } from '../../useAction';
import { Button, IconBranch, IconCheck, IconExternal, IconPr } from '../ui';
import { t } from '../../i18n';

/** Branch, pasta de trabalho e PR do card. São da história: a sub-tarefa mostra as do pai. */
export function WorkspaceBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const mode = state.board.git.mode;
  const [copied, setCopied] = useState(false);
  // o git roda no host e pode levar segundos: o botão mostra a espera até a branch (ou o erro) voltar
  const prepare = useAction(() => cards.prepareWorkspace(card.id));
  const [copyFailed, setCopyFailed] = useState(false);
  // o "Copiado" some sozinho, para o botão voltar a dizer o que o clique faz
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (card.deletedAt !== null || mode === 'off') return null;
  const story = storyOf(state, card) ?? card;
  const origin = story.derivedFrom ? state.cards.find((c) => c.id === story.derivedFrom) : undefined;

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
              // sem permissão ou sem área de transferência: avisa e oferece o nome para selecionar à mão
              const done = () => {
                setCopyFailed(false);
                setCopied(true);
              };
              const fail = () => {
                setCopied(false);
                setCopyFailed(true);
              };
              if (!navigator.clipboard?.writeText) return fail();
              navigator.clipboard.writeText(branch).then(done, fail);
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
            {copyFailed && (
              <>
                {t('Não foi possível copiar. Selecione o nome e copie com o teclado:')}{' '}
                <code style={{ userSelect: 'all' }}>{story.branch}</code>
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
          loading={prepare.busy}
          title={t('Cria a branch da história e, no modo worktree, a pasta de trabalho dela')}
          onClick={() => void prepare.run()}
        >
          {prepare.busy ? t('Criando a branch…') : t('Criar branch da história')}
        </Button>
      )}
      {origin && (
        <span
          className="muted small"
          title={t('A branch desta história parte da branch de {ref}, e o pull request é empilhado sobre o dela', { ref: cardRef(origin) })}
        >
          {t('Derivada de {ref}', { ref: cardRef(origin) })}
        </span>
      )}
      {story.prUrl && (
        <a href={story.prUrl} title={story.prUrl}>
          <IconPr /> Pull request <IconExternal />
        </a>
      )}
    </div>
  );
}
