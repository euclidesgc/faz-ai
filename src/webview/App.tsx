import { useEffect, useState } from 'react';
import { useAppearance } from './appearance';
import { t } from './i18n';
import { rich } from './i18n/rich';
import { humanQueue, pendingWork } from '../shared/pending';
import { useBoardStore, useHostSync } from './store/boardStore';
import { ui, attachments } from './commands';
import { AttachmentModal } from './components/attachment/AttachmentModal';
import type { Attachment } from '../shared/model';
import { ActivityBar } from './components/ActivityBar';
import { Board } from './components/Board';
import { CardDrawer } from './components/CardDrawer';
import { ChatPanel } from './components/chat/ChatPanel';
import { Dialog } from './components/Dialog';
import { FilterBar } from './components/FilterBar';
import { SelectionBar } from './components/SelectionBar';
import { AutopilotButton } from './components/AutopilotButton';
import { HeartbeatButton } from './components/HeartbeatButton';
import { ThemeToggle } from './components/ThemeToggle';
import { ArchivedView } from './components/ArchivedView';
import { TrashView } from './components/TrashView';
import { MetricsView } from './components/metrics/MetricsView';
import { Settings } from './components/settings/Settings';
import { RequirementsBanner } from './components/RequirementsBanner';
import { EnvironmentView } from './components/EnvironmentView';
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

  // a primeira abertura do board nesta máquina mostra o Diagnóstico do ambiente, uma vez
  const firstRun = state?.environmentFirstRun ?? false;
  useEffect(() => {
    if (!firstRun) return;
    setView('environment');
    ui.environmentSeen();
  }, [firstRun, setView]);

  if (!state)
    return (
      <div className="loading">
        {offline ? t('Sem ligação com o Faz AI. Abra o board de novo pelo editor ou pelo terminal.') : t('Carregando board…')}
      </div>
    );
  const trashCount = state.cards.filter((c) => c.deletedAt !== null).length;
  const withYou = humanQueue(state, pendingWork(state)).length;
  const onlyMine = filters.owner === 'human';

  return (
    <div className="app">
      <header className="topbar">
        <h1 title={state.board.name}>{state.board.name}</h1>
        <nav>
          {/* a visão atual vai no atributo (aria-current), não só na cor */}
          <Button active={view === 'board'} aria-current={view === 'board' ? 'page' : undefined} onClick={() => setView('board')}>
            {t('Board')}
          </Button>
          <Button active={view === 'metrics'} aria-current={view === 'metrics' ? 'page' : undefined} onClick={() => setView('metrics')}>
            {t('Métricas')}
          </Button>
          <Button active={view === 'archived'} aria-current={view === 'archived' ? 'page' : undefined} onClick={() => setView('archived')}>
            {t('Arquivados')}
          </Button>
          <Button active={view === 'trash'} aria-current={view === 'trash' ? 'page' : undefined} onClick={() => setView('trash')}>
            {t('Lixeira')}
            {trashCount > 0 && ` (${trashCount})`}
          </Button>
          <Button active={view === 'settings'} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>
            {t('Configurações')}
          </Button>
        </nav>
        <span className="spacer" />
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
            {onlyMine ? t('Ver todos os cards') : t('Ver {n} com você', { n: withYou })}
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
          <IconChat /> {isWeb && chatOpen ? t('Fechar chat') : t('Abrir chat')}
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
      {/* no Diagnóstico, os mesmos itens já estão na lista */}
      {view !== 'environment' && <RequirementsBanner />}
      {/* a barra de filtros filtra cards, não o log: fica só no board (RF-01) */}
      {view === 'board' && <FilterBar />}
      {view === 'board' && <SelectionBar />}
      <main className="content">
        {view === 'board' && <Board />}
        {view === 'archived' && <ArchivedView />}
        {view === 'trash' && <TrashView />}
        {view === 'settings' && <Settings />}
        {view === 'metrics' && <MetricsView />}
        {view === 'environment' && <EnvironmentView />}
      </main>
      <ActivityBar offline={offline} />
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
