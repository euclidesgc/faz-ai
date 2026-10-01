import { useEffect } from 'react';
import { onHostMessage } from './vscode';
import { useBoardStore } from './store/boardStore';
import { Board } from './components/Board';
import { CardDrawer } from './components/CardDrawer';
import { Dialog } from './components/Dialog';
import { FilterBar } from './components/FilterBar';
import { TrashView } from './components/TrashView';
import { Settings } from './components/settings/Settings';

export function App() {
  const { state, error, view, setState, setError, setView, send, openCardId, openCard } = useBoardStore();

  useEffect(() => {
    const off = onHostMessage((msg) => {
      if (msg.type === 'boardState') setState(msg.state, msg.attachmentsBaseUri);
      else if (msg.type === 'error') setError(msg.message);
      else if (msg.type === 'ui.openCard') {
        setView('board');
        openCard(msg.cardId);
      }
    });
    send({ type: 'ready' });
    return off;
  }, [setState, setError, setView, openCard, send]);

  if (!state) return <div className="loading">Carregando board…</div>;
  const trashCount = state.cards.filter((c) => c.deletedAt !== null).length;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{state.board.name}</h1>
        <nav>
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'trash' ? 'active' : ''} onClick={() => setView('trash')}>Lixeira{trashCount > 0 && ` (${trashCount})`}</button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>Configurações</button>
        </nav>
      </header>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} <span className="muted">(clique para fechar)</span></div>}
      {view === 'board' && <FilterBar />}
      <main className="content">
        {view === 'board' && <Board />}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <Settings />}
      </main>
      {openCardId && <CardDrawer cardId={openCardId} />}
      <Dialog />
    </div>
  );
}
