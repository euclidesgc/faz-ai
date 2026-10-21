import type { IsolationLeak, ProfileIsolation } from '../shared/aiProfiles';
import { t } from './i18n';

/** O que a CLI carrega por conta própria (tipo e origem), no idioma da interface. */
export function leakText(l: IsolationLeak): string {
  const project = l.scope === 'project';
  switch (l.kind) {
    case 'instructions':
      return project ? t('regras do projeto') : t('regras do usuário');
    case 'skill':
      return project ? t('skills do projeto') : t('skills do usuário');
    case 'agent':
      return project ? t('agentes do projeto') : t('agentes do usuário');
    case 'hook':
      return project ? t('hooks do projeto') : t('hooks do usuário');
    case 'mcp':
      return project ? t('servidores MCP do projeto') : t('servidores MCP do usuário');
  }
}

/** A lista do que a CLI carrega, separada por vírgula; inclui os itens que o board não reconheceu. */
export function leaksList(iso: ProfileIsolation): string {
  const parts = iso.loads.map(leakText);
  if (iso.unrecognized) parts.push(t('itens não reconhecidos'));
  return parts.join(', ');
}

/**
 * O resumo do isolamento. `enforced` vem de `contextEnforced(perfil)` (capacidades verificadas): lista
 * vazia sozinha nunca vira "Contexto vazio (imposto)".
 */
export function isolationText(iso: ProfileIsolation, enforced: boolean): string {
  const list = leaksList(iso);
  if (list) return t('A CLI pode carregar por conta própria: {list}.', { list });
  return enforced ? t('Contexto vazio (imposto)') : t('Nenhum item conhecido carregado (sem prova de isolamento)');
}
