import { useAppearance } from './appearance';
import { t } from './i18n';
import { ChatPanel } from './components/chat/ChatPanel';
import { useBoardStore, useHostSync } from './store/boardStore';

/** Conteúdo da seção "Chat" da barra lateral. */
export function ChatApp() {
  useHostSync();
  useAppearance();
  const state = useBoardStore((s) => s.state);
  if (!state) return <div className="loading">{t('Carregando…')}</div>;
  return (
    <div className="chat-view">
      <ChatPanel />
    </div>
  );
}
