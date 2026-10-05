import { useAppearance } from './appearance';
import { t } from './i18n';
import { ChatPanel } from './components/chat/ChatPanel';
import { RequirementsBanner } from './components/RequirementsBanner';
import { useBoardStore, useHostSync } from './store/boardStore';

/** Conteúdo da seção "Chat" da barra lateral. */
export function ChatApp() {
  useHostSync();
  useAppearance();
  const state = useBoardStore((s) => s.state);
  if (!state) return <div className="loading">{t('Carregando…')}</div>;
  return (
    <div className="chat-view">
      {/* sem os requisitos, as perguntas do chat falham: o aviso fica aqui também, só com os títulos e as ações */}
      <RequirementsBanner compact />
      <ChatPanel />
    </div>
  );
}
