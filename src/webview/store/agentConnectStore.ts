import { create } from 'zustand';
import {
  ACCOUNT_UNCHECKED,
  TEST_IDLE,
  appendTestEvent,
  type AgentAccount,
  type ProtocolLogEntry,
  type RegistryListing,
  type TestItem,
  type TestState,
} from '../../shared/agentConnect';
import type { HostToWebview } from '../../shared/messages';
import { agentConnect } from '../commands';
import { onHostMessage, postToHost } from '../vscode';

/** A situação de um perfil pela sonda do host: a ferramenta achada, a versão e o login da CLI. */
export type ProfileStatus = Extract<HostToWebview, { type: 'aiProfiles.status' }>['profiles'][string];
/** O resultado do teste rápido de um perfil (um pedido curto pelo mesmo caminho dos cards). */
export type QuickTest = Extract<HostToWebview, { type: 'aiProfiles.testResult' }>;

/** As abas do agente escolhido na tela. */
export type AgentTab = 'connection' | 'models' | 'test';

/**
 * Conectar agentes: o que vem do host fica fora dos componentes, para não se perder quando a pessoa troca de aba
 * nas Configurações (a sessão de teste pode estar respondendo, um login pode estar em curso no terminal).
 */
interface AgentConnectStore {
  listing: RegistryListing | null;
  /** o perfil tem a ferramenta no PATH */
  installed: Record<string, boolean>;
  loadingRegistry: boolean;
  registryError: string | null;
  loadRegistry(refresh?: boolean): void;
  /** a conta de cada agente (`key`: o id do perfil ou `registry:<id>`) */
  accounts: Record<string, AgentAccount>;
  statuses: Record<string, ProfileStatus>;
  quickTests: Record<string, QuickTest>;
  /** o agente escolhido na lista; null = o agente padrão */
  selected: string | null;
  tab: AgentTab;
  select(key: string, tab?: AgentTab): void;
  setTab(tab: AgentTab): void;
  test: TestState;
  /** o agente da sessão de teste aberta (ou abrindo) nesta tela */
  testKey: string | null;
  /** abre a sessão de teste com o agente; a anterior desta tela fecha */
  openTest(key: string): Promise<void>;
  items: TestItem[];
  /** o último `usage_update`: contexto usado e o tamanho da janela, em tokens */
  usage: { used: number; size: number } | null;
  clearItems(): void;
  /** o log do protocolo desta tela, desde que ela abriu (o arquivo guarda tudo) */
  log: ProtocolLogEntry[];
  logFile: string | null;
  clearLog(): void;
}

/** Quantas linhas do log a tela guarda: o streaming de uma resposta longa manda centenas de avisos. */
export const MAX_LOG_ENTRIES = 2000;

let listening = false;
let pendingRegistry: string | null = null;

export const useAgentConnectStore = create<AgentConnectStore>((set, get) => ({
  listing: null,
  installed: {},
  loadingRegistry: false,
  registryError: null,
  loadRegistry(refresh = false) {
    if (get().loadingRegistry) return;
    pendingRegistry = Math.random().toString(36).slice(2);
    set({ loadingRegistry: true, registryError: null });
    postToHost({ type: 'agentConnect.registry', requestId: pendingRegistry, ...(refresh ? { refresh } : {}) });
  },
  accounts: {},
  statuses: {},
  quickTests: {},
  selected: null,
  tab: 'connection',
  select(key, tab) {
    set({ selected: key, ...(tab ? { tab } : {}) });
  },
  setTab(tab) {
    set({ tab });
  },
  test: TEST_IDLE,
  testKey: null,
  async openTest(key) {
    set({ testKey: key });
    await agentConnect.openTest(key);
  },
  items: [],
  usage: null,
  clearItems() {
    set({ items: [], usage: null });
  },
  log: [],
  logFile: null,
  clearLog() {
    set({ log: [] });
  },
}));

/** A conta de um agente, ou a de "não verificada" quando a tela ainda não perguntou. */
export const accountOf = (accounts: Record<string, AgentAccount>, key: string): AgentAccount => accounts[key] ?? ACCOUNT_UNCHECKED;

/** Liga a store às mensagens do host uma vez só, e pede o que já existe (contas, sessão de teste, arquivo do log). */
export function listenAgentConnect(): void {
  if (listening) return;
  listening = true;
  onHostMessage((msg) => {
    switch (msg.type) {
      case 'agentConnect.registryResult':
        if (msg.requestId !== pendingRegistry) return;
        pendingRegistry = null;
        useAgentConnectStore.setState((s) => ({
          loadingRegistry: false,
          listing: msg.listing ?? s.listing,
          installed: msg.installed ?? s.installed,
          registryError: msg.error ?? msg.listing?.error ?? null,
        }));
        return;
      case 'agentConnect.accounts':
        useAgentConnectStore.setState({ accounts: msg.accounts });
        return;
      case 'agentConnect.account':
        useAgentConnectStore.setState((s) => ({ accounts: { ...s.accounts, [msg.key]: msg.account } }));
        return;
      case 'agentConnect.test.state':
        // uma sessão nova (outro agente ou aberta de novo) começa com a conversa limpa
        useAgentConnectStore.setState((s) => ({
          test: msg.state,
          ...(msg.state.connection ? { testKey: msg.state.connection.key } : {}),
          ...(msg.state.phase === 'connecting' && !msg.state.connection ? { items: [], usage: null } : {}),
          ...(msg.state.phase === 'idle' && !s.items.length ? { testKey: null } : {}),
        }));
        return;
      case 'agentConnect.test.event': {
        const ev = msg.event;
        useAgentConnectStore.setState((s) => ({
          items: appendTestEvent(s.items, ev),
          ...(ev.kind === 'usage' ? { usage: { used: ev.used, size: ev.size } } : {}),
        }));
        return;
      }
      case 'agentConnect.log': {
        const entry = msg.entry;
        useAgentConnectStore.setState((s) => ({ log: [...s.log, entry].slice(-MAX_LOG_ENTRIES) }));
        return;
      }
      case 'agentConnect.logFile':
        useAgentConnectStore.setState({ logFile: msg.file });
        return;
      case 'aiProfiles.status':
        useAgentConnectStore.setState({ statuses: msg.profiles });
        return;
      case 'aiProfiles.testResult':
        useAgentConnectStore.setState((s) => ({ quickTests: { ...s.quickTests, [msg.id]: msg } }));
        return;
    }
  });
  postToHost({ type: 'agentConnect.sync' });
}
