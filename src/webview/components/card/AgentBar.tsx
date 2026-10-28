import { Callout } from '@radix-ui/themes';
import { toolGaps } from '../../../shared/artifactLibrary';
import { NEUTRAL_TOOLS } from '../../../shared/artifactTools';
import { manifestOf, profileOf } from '../../../shared/execution';
import { selectedMcpNames, selectedRuleLocations, selectedSkillNames } from '../../../shared/harnessSelection';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { IconWarning, SelectField } from '../ui';
import { t, dt } from '../../i18n';

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
  // o que está em modo "Sempre" no board entra em toda execução, sem o card indicar: a pessoa vê o custo completo
  const always = {
    skills: selectedSkillNames(state, 'always'),
    rules: selectedRuleLocations(state, 'always'),
    mcps: selectedMcpNames(state, 'always'),
  };
  const withAlways = (own: string[], on: string[]) => [
    ...own.map((n) => (on.includes(n) ? t('{name} (sempre)', { name: n }) : n)),
    ...on.filter((n) => !own.includes(n)).map((n) => t('{name} (sempre)', { name: n })),
  ];
  const skills = withAlways(manifest.skills, always.skills);
  const rules = withAlways(manifest.rules, always.rules);
  // os do modo Sempre já vêm no manifesto; aqui só ganham a marca
  const mcps = withAlways(manifest.mcpServers, always.mcps);

  // as skills vinculadas que pedem tools que o agente não concede: só avisa, não bloqueia
  const gaps = toolGaps(state, card);
  const toolLabel = (id: string) => t(NEUTRAL_TOOLS.find((x) => x.id === id)?.label ?? id);

  return (
    <>
      <div
        className="drawer-workspace"
        title={t('O que a sessão de IA usa para trabalhar neste card: agente, skills, rules, servidores MCP, ferramentas e modelo')}
      >
        <span>{t('Agente')}</span>
        <SelectField
          aria-label={t('Agente')}
          options={[
            {
              value: FROM_PHASE,
              label: inherited ? t('Da fase ({name})', { name: dt(inherited.name) }) : t('Da fase (nenhum)'),
            },
            ...profiles.map((p) => ({ value: p.id, label: dt(p.name) })),
          ]}
          value={card.execProfile ?? FROM_PHASE}
          onChange={(id) => cards.setExecProfile(card.id, id === FROM_PHASE ? null : id)}
        />
        {(manifest.profile || skills.length > 0 || rules.length > 0) && (
          <span className="muted small">
            {[
              skills.length && t('skills: {list}', { list: skills.join(', ') }),
              rules.length && t('rules: {list}', { list: rules.join(', ') }),
              mcps.length ? t('MCP: board + {list}', { list: mcps.join(', ') }) : t('MCP: board'),
              manifest.model &&
                (manifest.model.effort
                  ? t('modelo {name} · {effort}', { name: manifest.model.name, effort: manifest.model.effort })
                  : t('modelo {name}', { name: manifest.model.name })),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
      {gaps.map((g) => (
        <Callout.Root key={g.skill} color="amber" size="1" role="alert">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t('A skill {skill} pede {tools}, que o agente {agent} não concede.', {
              skill: g.skill,
              tools: g.missing.map(toolLabel).join(', '),
              agent: dt(g.agent),
            })}
          </Callout.Text>
        </Callout.Root>
      ))}
    </>
  );
}
