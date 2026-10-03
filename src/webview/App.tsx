import { useEffect, useState } from 'react';
import { useAppearance } from './appearance';
import { t, tn } from './i18n';
import { rich } from './i18n/rich';
import { humanQueue, pendingWork } from '../shared/pending';
import { useBoardStore, useHostSync } from './store/boardStore';
import { ui, attachments } from './commands';
import { AttachmentModal } from './components/attachment/AttachmentModal';
import type { Attachment } from '../shared/model';
import { Board } from './components/Board';
import { CardDrawer } from './components/CardDrawer';
import { ChatPanel } from './components/chat/ChatPanel';
import { Dialog } from './components/Dialog';
import { FilterBar } from './components/FilterBar';
import { AutopilotButton } from './components/AutopilotButton';
import { HeartbeatButton } from './components/HeartbeatButton';
import { ThemeToggle } from './components/ThemeToggle';
import { TrashView } from './components/TrashView';
import { Settings } from './components/settings/Settings';
import { Button, IconChat, IconClose, IconExternal } from './components/ui';
import { isWeb, onConnectionChange } from './vscode';

export function App() {
  useHostSync();
  useAppearance();
  const { state, error, notice, view, setError, setNotice, setView, openCardId, filters, setFilters, chatOpen, setChatOpen } =
    useBoardStore();
  const attachmentsBaseUri = useBoardStore((s) => s.attachmentsBaseUri);
  const [offline, setOffline] = useState(false);

  // "Salvar como…" diverge por ambiente: na web não há diálogo nativo, então a modal baixa o
  // arquivo pela rota estática já servida; no editor, o host abre o showSaveDialog do VS Code.
  const saveAttachmentAs = (a: Attachment) => {
    if (isWeb) {
      const link = document.createElement('a');
      link.href = `${attachmentsBaseUri}/${a.cardId}/${encodeURIComponent(a.storedName)}`;
      link.download = a.filename;
      link.click();
    } else {
      attachments.saveAs(a.id);
    }
  };

  // erros (ex.: regra de conclusão) e avisos somem sozinhos
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 12000);
    return () => clearTimeout(timer);
  }, [error, setError]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  useEffect(() => onConnectionChange((online) => setOffline(!online)), []);

  if (!state)
    return (
      <div className="loading">
        {offline ? t('Sem ligação com o Faz AI. Abra o board de novo pelo editor ou pelo terminal.') : t('Carregando board…')}
      </div>
    );
  const trashCount = state.cards.filter((c) => c.deletedAt !== null).length;
  const withYou = humanQueue(state, pendingWork(state)).length;
  const running = state.aiRuns.length;
  const onlyMine = filters.owner === 'human';

  return (
    <div className="app">
      <header className="topbar">
        <h1 title={state.board.name}>{state.board.name}</h1>
        <nav>
          <Button active={view === 'board'} onClick={() => setView('board')}>
            {t('Board')}
          </Button>
          <Button active={view === 'trash'} onClick={() => setView('trash')}>
            {t('Lixeira')}
            {trashCount > 0 && ` (${trashCount})`}
          </Button>
          <Button active={view === 'settings'} onClick={() => setView('settings')}>
            {t('Configurações')}
          </Button>
        </nav>
        <span className="spacer" />
        {running > 0 && (
          <span className="topbar-info" title={t('Execuções da IA em andamento')}>
            <span className="spinner" /> {tn(running, 'IA trabalhando em {n} card', 'IA trabalhando em {n} cards')}
          </span>
        )}
        {withYou > 0 && (
          <Button
            className="topbar-pending"
            on={onlyMine}
            title={
              onlyMine
                ? t('Mostrando só o que espera por você. Clique para ver tudo.')
                : t('Cards esperando revisão, resposta ou desbloqueio. Clique para ver só eles.')
            }
            onClick={() => {
              setView('board');
              setFilters({ owner: onlyMine ? 'any' : 'human' });
            }}
          >
            {t('{n} com você', { n: withYou })}
          </Button>
        )}
        {!isWeb && (
          <Button variant="ghost" title={t('Abre este board no navegador, fora do editor')} onClick={() => ui.openInBrowser()}>
            {t('Abrir no navegador')} <IconExternal />
          </Button>
        )}
        <Button
          variant="ghost"
          on={isWeb && chatOpen}
          title={isWeb ? t('Conversar com a IA sobre o board') : t('Abre o chat com a IA na barra lateral')}
          onClick={() => (isWeb ? setChatOpen(!chatOpen) : ui.showChat())}
        >
          <IconChat /> {t('Chat')}
        </Button>
        <AutopilotButton />
        <HeartbeatButton offline={offline} />
        <ThemeToggle />
      </header>
      {offline && (
        <div className="banner warn offline">
          {rich(
            'Sem ligação com o Faz AI: o que você fizer agora não é salvo. A página reconecta sozinha quando o editor (ou o comando <code>faz-ai</code>) voltar.',
          )}
        </div>
      )}
      {view === 'board' && <FilterBar />}
      <main className="content">
        {view === 'board' && <Board />}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <Settings />}
      </main>
      {isWeb && chatOpen && (
        <aside className="chat-drawer">
          <Button
            variant="icon"
            className="drawer-close"
            title={t('Fechar o chat')}
            aria-label={t('Fechar o chat')}
            onClick={() => setChatOpen(false)}
          >
            <IconClose />
          </Button>
          <ChatPanel />
        </aside>
      )}
      {openCardId && <CardDrawer cardId={openCardId} />}
      <AttachmentModal onSaveAs={saveAttachmentAs} />
      <Dialog />
      <div className="toasts" aria-live="polite">
        {error && (
          <div className="toast error" role="alert">
            <span>{t(error)}</span>
            <Button variant="icon" aria-label={t('Fechar aviso')} onClick={() => setError(null)}>
              <IconClose />
            </Button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <span>{t(notice)}</span>
            <Button variant="icon" aria-label={t('Fechar aviso')} onClick={() => setNotice(null)}>
              <IconClose />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
