import { manifestOf, profileOf } from '../../../shared/execution';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';

/** Agente de execução do card e o resumo do que a sessão de IA vai usar com ele. */
export function AgentBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const profiles = state.board.execProfiles;
  if (card.deletedAt !== null || profiles.length === 0) return null;
  const manifest = manifestOf(state, card);
  // o agente que vale quando o card não escolhe um: o da fase ou o padrão do board
  const inherited = profileOf(state, { ...card, execProfile: null });

  return (
    <div
      className="drawer-workspace"
      title="O que a sessão de IA usa para trabalhar neste card: skills, servidores MCP, ferramentas e modelo"
    >
      <span>Agente</span>
      <select value={card.execProfile ?? ''} onChange={(e) => cards.setExecProfile(card.id, e.target.value || null)}>
        <option value="">Da fase{inherited ? ` (${inherited.name})` : ' (nenhum)'}</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {manifest.profile && (
        <span className="muted small">
          {[
            manifest.agent && `subagente ${manifest.agent}`,
            manifest.skills.length && `skills: ${manifest.skills.join(', ')}`,
            manifest.mcpServers && `MCP: board${manifest.mcpServers.length ? ` + ${manifest.mcpServers.join(', ')}` : ''}`,
            manifest.model && `modelo ${manifest.model.name}${manifest.model.effort ? ` · ${manifest.model.effort}` : ''}`,
            manifest.clean && 'sessão limpa',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
