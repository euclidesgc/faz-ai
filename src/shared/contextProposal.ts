// Proposta de configuração mínima pela IA (E6.1): um rascunho revisável. Nunca grava sozinha e nunca muda o agente,
// o contrato (autorizações) nem as prioridades; só sugere skills adicionais e MCPs ativos dentro do que o agente permite.
import type { ContextActivityTarget } from './contextPlanning';
import type { BoardState } from './model';

export interface ContextProposalItem {
  artifactId: string;
  reason: string;
}
export interface ContextProposal {
  target: ContextActivityTarget;
  /** o agente da atividade no momento da proposta; a IA não o troca */
  agentId: string;
  explanation: string;
  additionalSkills: ContextProposalItem[];
  activeMcps: ContextProposalItem[];
  /** resumo das entradas usadas; se mudar, a proposta está desatualizada */
  inputsHash: string;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * As entradas que a proposta leu: texto e dependências do card, agente escolhido (e a revisão do contrato) e o
 * catálogo (id, revisão e disponibilidade de cada skill e MCP). Mudar qualquer uma marca a revisão como desatualizada.
 */
export function proposalInputsHash(s: BoardState, target: ContextActivityTarget, agentId: string): string {
  const card = target.cardId === null ? undefined : s.cards.find((c) => c.id === target.cardId);
  const contract = s.contextPlanning?.agents.find((a) => a.artifactId === agentId);
  return fnv1a(
    JSON.stringify({
      target,
      card: card && {
        title: card.title,
        description: card.description,
        links: s.links.filter((l) => l.fromId === card.id || l.toId === card.id).map((l) => [l.fromId, l.toId, l.kind]),
      },
      agent: [agentId, contract?.revision ?? null, contract && JSON.stringify(contract.contract)],
      catalog: (s.harness.library?.artifacts ?? [])
        .filter((a) => a.kind === 'skill' || a.kind === 'mcp' || a.id === agentId)
        .map((a) => [a.id, a.revision ?? a.updatedAt, a.missing]),
    }),
  );
}

export function isProposalStale(s: BoardState, proposal: ContextProposal): boolean {
  return proposalInputsHash(s, proposal.target, proposal.agentId) !== proposal.inputsHash;
}
