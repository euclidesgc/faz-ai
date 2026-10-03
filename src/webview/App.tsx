import { useEffect, useState } from 'react';
import { useAppearance } from './appearance';
import { humanQueue, pendingWork } from '../shared/pending';
import { useBoardStore, useHostSync } from './store/boardStore';
import { ui } from './commands';
import { Board } from './components/Board';
import { CardDrawer } from './components/CardDrawer';
import { Dialog } from './components/Dialog';
import { FilterBar } from './components/FilterBar';
import { HeartbeatButton } from './components/HeartbeatButton';
import { ThemeToggle } from './components/ThemeToggle';
import { TrashView } from './components/TrashView';
import { Settings } from './components/settings/Settings';
import { Button, IconClose, IconExternal } from './components/ui';
import { isWeb, onConnectionChange } from './vscode';

export function App() {
  useHostSync();
  useAppearance();
  const { state, error, notice, view, setError, setNotice, setView, openCardId, filters, setFilters } = useBoardStore();
  const [offline, setOffline] = useState(false);

  // erros (ex.: regra de conclusão) e avisos somem sozinhos
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 12000);
    return () => clearTimeout(t);
  }, [error, setError]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  useEffect(() => onConnectionChange((online) => setOffline(!online)), []);

  if (!state)
    return (
      <div className="loading">
        {offline ? 'Sem ligação com o Faz AI. Abra o board de novo pelo editor ou pelo terminal.' : 'Carregando board…'}
      </div>
    );
  const trashCount = state.cards.filter((c) => c.deletedAt !== null).length;
  const withYou = humanQueue(pendingWork(state)).length;
  const running = state.aiRuns.length;
  const onlyMine = filters.owner === 'human';

  return (
    <div className="app">
      <header className="topbar">
        <h1 title={state.board.name}>{state.board.name}</h1>
        <nav>
          <Button active={view === 'board'} onClick={() => setView('board')}>
            Board
          </Button>
          <Button active={view === 'trash'} onClick={() => setView('trash')}>
            Lixeira{trashCount > 0 && ` (${trashCount})`}
          </Button>
          <Button active={view === 'settings'} onClick={() => setView('settings')}>
            Configurações
          </Button>
        </nav>
        <span className="spacer" />
        {running > 0 && (
          <span className="topbar-info" title="Execuções da IA em andamento">
            <span className="spinner" /> IA trabalhando em {running} card{running > 1 ? 's' : ''}
          </span>
        )}
        {withYou > 0 && (
          <Button
            className="topbar-pending"
            on={onlyMine}
            title={
              onlyMine
                ? 'Mostrando só o que espera por você. Clique para ver tudo.'
                : 'Cards esperando revisão, resposta ou desbloqueio. Clique para ver só eles.'
            }
            onClick={() => {
              setView('board');
              setFilters({ owner: onlyMine ? 'any' : 'human' });
            }}
          >
            {withYou} com você
          </Button>
        )}
        {!isWeb && (
          <Button variant="ghost" title="Abre este board no navegador, fora do editor" onClick={() => ui.openInBrowser()}>
            Abrir no navegador <IconExternal />
          </Button>
        )}
        <HeartbeatButton offline={offline} />
        <ThemeToggle />
      </header>
      {offline && (
        <div className="banner warn offline">
          Sem ligação com o Faz AI: o que você fizer agora não é salvo. A página reconecta sozinha quando o editor (ou o comando{' '}
          <code>faz-ai</code>) voltar.
        </div>
      )}
      {view === 'board' && <FilterBar />}
      <main className="content">
        {view === 'board' && <Board />}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <Settings />}
      </main>
      {openCardId && <CardDrawer cardId={openCardId} />}
      <Dialog />
      <div className="toasts" aria-live="polite">
        {error && (
          <div className="toast error" role="alert">
            <span>{error}</span>
            <Button variant="icon" aria-label="Fechar aviso" onClick={() => setError(null)}>
              <IconClose />
            </Button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <Button variant="icon" aria-label="Fechar aviso" onClick={() => setNotice(null)}>
              <IconClose />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
