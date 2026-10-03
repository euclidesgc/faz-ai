import { manifestOf, profileOf } from '../../../shared/execution';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { SelectField } from '../ui';
import { t } from '../../i18n';

/** O Select do Radix não aceita valor vazio: "o agente da fase" usa este. */
const FROM_PHASE = '__phase';

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
      title={t('O que a sessão de IA usa para trabalhar neste card: skills, servidores MCP, ferramentas e modelo')}
    >
      <span>{t('Agente')}</span>
      <SelectField
        aria-label={t('Agente')}
        options={[
          {
            value: FROM_PHASE,
            label: inherited ? t('Da fase ({name})', { name: inherited.name }) : t('Da fase (nenhum)'),
          },
          ...profiles.map((p) => ({ value: p.id, label: p.name })),
        ]}
        value={card.execProfile ?? FROM_PHASE}
        onChange={(id) => cards.setExecProfile(card.id, id === FROM_PHASE ? null : id)}
      />
      {manifest.profile && (
        <span className="muted small">
          {[
            manifest.agent && t('subagente {name}', { name: manifest.agent }),
            manifest.skills.length && t('skills: {list}', { list: manifest.skills.join(', ') }),
            manifest.mcpServers &&
              (manifest.mcpServers.length ? t('MCP: board + {list}', { list: manifest.mcpServers.join(', ') }) : t('MCP: board')),
            manifest.model &&
              (manifest.model.effort
                ? t('modelo {name} · {effort}', { name: manifest.model.name, effort: manifest.model.effort })
                : t('modelo {name}', { name: manifest.model.name })),
            manifest.clean && t('sessão limpa'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
