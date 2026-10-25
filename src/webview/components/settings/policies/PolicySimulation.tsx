import { useState } from 'react';
import { Button, Checkbox } from '@radix-ui/themes';
import type { ExecutionPolicy } from '../../../../shared/executionPolicies';
import { POLICY_FAILURES } from '../../../../shared/executionPolicies';
import { CONTEXT_ACTIONS } from '../../../../shared/contextPlanning';
import { CONTEXT_ACTION_LABELS } from '../../../../shared/contextPlan';
import type { PolicyLibrary, PolicyScenario, PolicySimulation as Simulation } from '../../../../shared/policyManagement';
import { requestExecutionPolicy } from '../../../request';
import { useAction } from '../../../useAction';
import { t } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { Choice, NumberField, ORIGIN_LABELS, FAILURE_LABELS, REASON_LABELS, offTargetNote, profileLabel, targetLabel } from './parts';

/**
 * O simulador das regras: uma pergunta ("se este modelo esgotar a cota agora, o que o board faz?") com o
 * modelo, a fase e o tipo de card; o resto do cenário (perfil padrão, tipo de falha, efeitos, estado dos
 * destinos, ação, origem, agente, tempo e processos) fica fechado em "Mais condições". O cenário simples
 * supõe os destinos admitidos e sem trabalho feito: é a decisão das regras que a pessoa quer ver, não a
 * admissão hipotética.
 */
type Scenario = Omit<PolicyScenario, 'draft'>;

/** O cenário que a regra descreve: o primeiro modelo, a primeira fase, o primeiro tipo… de cada condição dela. */
function scenarioOf(rule: ExecutionPolicy, library: PolicyLibrary, base: Scenario): Scenario {
  const { conditions: c } = rule;
  const profileId = c.profileIds[0];
  const model = c.models[0] ?? (profileId ? library.models.find((m) => m.tool === profileId)?.model : undefined);
  const option = library.models.find((m) => (!profileId || m.tool === profileId) && m.model === model);
  return {
    ...base,
    sourceValue: option ? `${option.tool}:${option.model}${option.defaultEffort ? `@${option.defaultEffort}` : ''}` : base.sourceValue,
    ...(profileId ? { defaultProfileId: profileId } : {}),
    failure: c.failures[0] ?? 'quota',
    explicit: c.explicit !== 'exclude',
    context: {
      action: c.actions[0] ?? 'work',
      origin: c.origins[0] ?? 'manual',
      agentId: c.agentIds[0] ?? null,
      phaseId: c.phaseIds[0] ?? null,
      cardTypeId: c.cardTypeIds[0] ?? null,
    },
  };
}

export function PolicySimulation({ policy, library }: { policy: ExecutionPolicy | null; library: PolicyLibrary }) {
  const state = useBoardStore((s) => s.state)!;
  const first = library.models[0];
  // sem rascunho (a seção): a pessoa escolhe qual regra salva testar; a regra escolhida vai como rascunho
  // ligado, para a desligada ser testada como se estivesse ligada
  const records = library.snapshot.records;
  const [ruleId, setRuleId] = useState<string | null>(policy ? null : (records[0]?.policy.id ?? null));
  const selected = policy ? null : (records.find((r) => r.policy.id === ruleId)?.policy ?? null);
  const base: Scenario = {
    sourceValue: first ? `${first.tool}:${first.model}${first.defaultEffort ? `@${first.defaultEffort}` : ''}` : '',
    defaultProfileId: state.board.aiTool,
    explicit: true,
    context: { action: 'work', origin: 'manual', agentId: null, phaseId: null, cardTypeId: null },
    failure: 'quota',
    effects: 'none',
    eligibility: 'admitted',
    elapsedMs: 0,
    runningGlobal: 0,
    runningByProfile: {},
  };
  const [scenario, setScenario] = useState<Scenario>(() => (selected ? scenarioOf(selected, library, base) : base));
  const pickRule = (id: string) => {
    setRuleId(id);
    const rule = records.find((r) => r.policy.id === id)?.policy;
    if (rule) setScenario(scenarioOf(rule, library, scenario));
  };
  const draft = policy ?? (selected ? { ...selected, enabled: true } : null);
  const [result, setResult] = useState<{ value: Simulation; inputs: string } | null>(null);
  const fingerprint = JSON.stringify([
    draft,
    scenario,
    library,
    state.executionPolicyRevision,
    state.board.modelCatalog,
    state.columns,
    state.cardTypes,
    state.harness.library?.artifacts,
  ]);
  const simulate = useAction(async () => {
    const response = await requestExecutionPolicy({ type: 'executionPolicy.simulate', scenario: { ...scenario, draft } });
    if (!response.simulation) throw new Error(t('A simulação não retornou uma decisão.'));
    setResult({ value: response.simulation, inputs: fingerprint });
  });
  const change = (patch: Partial<typeof scenario>) => setScenario({ ...scenario, ...patch });
  const context = (patch: Partial<PolicyScenario['context']>) => change({ context: { ...scenario.context, ...patch } });
  const modelChoices = [
    { value: '__default', label: t('Modelo padrão') },
    ...library.models.map((m) => ({
      value: `${m.tool}:${m.model}${m.defaultEffort ? `@${m.defaultEffort}` : ''}`,
      label: `${profileLabel(library, m.tool)} · ${m.label}`,
    })),
  ];
  const ruleName = (id: string) =>
    id === policy?.id ? policy.name : (library.snapshot.records.find((r) => r.policy.id === id)?.policy.name ?? id);
  const decision = result?.value.decision;
  return (
    <section aria-label={policy ? t('Simular esta regra') : t('Testar as regras')} className="fallback-simulation">
      <h4>{policy ? t('Simular esta regra') : t('Testar as regras')}</h4>
      <p className="muted">
        {policy
          ? t('Se este modelo esgotar a cota agora, o que esta regra faz? Sem iniciar IA nem gravar nada.')
          : t(
              'Se este modelo esgotar a cota agora, o que o board faz? Sem iniciar IA nem gravar nada: a decisão das regras salvas e ligadas.',
            )}
      </p>
      {!policy && records.length === 0 && <p className="muted">{t('Monte uma regra primeiro: o teste simula a regra escolhida.')}</p>}
      {!policy && records.length > 0 && (
        <div className="fallback-grid">
          <Choice
            label={t('Regra a testar')}
            value={ruleId ?? ''}
            choices={records.map((r) => ({
              value: r.policy.id,
              label: r.policy.enabled ? r.policy.name : `${r.policy.name} (${t('desligada')})`,
            }))}
            onChange={pickRule}
          />
        </div>
      )}
      <div className="fallback-grid">
        <Choice
          label={t('Modelo que falha')}
          value={scenario.sourceValue || '__default'}
          choices={modelChoices}
          onChange={(v) => change({ sourceValue: v === '__default' ? '' : v })}
        />
        <Choice
          label={t('Fase')}
          value={scenario.context.phaseId ?? '__none'}
          choices={[
            { value: '__none', label: t('Qualquer fase') },
            ...state.columns.map((c) => ({
              value: c.id,
              label: `${state.workflows.find((w) => w.id === c.workflowId)?.name} · ${c.name}`,
            })),
          ]}
          onChange={(v) => context({ phaseId: v === '__none' ? null : v })}
        />
        <Choice
          label={t('Tipo de card')}
          value={scenario.context.cardTypeId ?? '__none'}
          choices={[{ value: '__none', label: t('Qualquer tipo') }, ...state.cardTypes.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(v) => context({ cardTypeId: v === '__none' ? null : v })}
        />
      </div>
      <details className="fallback-advanced">
        <summary>{t('Mais condições do cenário')}</summary>
        <div className="fallback-advanced-body">
          <div className="fallback-grid">
            <Choice
              label={t('Perfil padrão do cenário')}
              value={scenario.defaultProfileId}
              choices={library.profiles.map((p) => ({ value: p.id, label: profileLabel(library, p.id) }))}
              onChange={(v) => change({ defaultProfileId: v })}
            />
            <Choice
              label={t('Tipo de falha')}
              value={scenario.failure}
              choices={POLICY_FAILURES.map((f) => ({ value: f, label: t(FAILURE_LABELS[f]) }))}
              onChange={(v) => change({ failure: v as PolicyScenario['failure'] })}
            />
            <Choice
              label={t('O que a IA já tinha feito')}
              value={scenario.effects}
              choices={[
                { value: 'none', label: t('Nada') },
                { value: 'partial', label: t('Trabalho parcial') },
                { value: 'unknown', label: t('Desconhecido') },
              ]}
              onChange={(v) => change({ effects: v as PolicyScenario['effects'] })}
            />
            <Choice
              label={t('Estado dos destinos')}
              value={scenario.eligibility}
              choices={[
                { value: 'admitted', label: t('Prontos (credenciais revisadas e admissão válida)') },
                { value: 'blocked-admission', label: t('Sem admissão comprovada') },
                { value: 'pending-credentials', label: t('Credenciais pendentes') },
                { value: 'unavailable', label: t('Indisponíveis') },
              ]}
              onChange={(v) => change({ eligibility: v as PolicyScenario['eligibility'] })}
            />
            <Choice
              label={t('Ação do cenário')}
              value={scenario.context.action}
              choices={CONTEXT_ACTIONS.map((a) => ({ value: a, label: t(CONTEXT_ACTION_LABELS[a]) }))}
              onChange={(v) => context({ action: v as PolicyScenario['context']['action'] })}
            />
            <Choice
              label={t('Origem do cenário')}
              value={scenario.context.origin}
              choices={Object.entries(ORIGIN_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
              onChange={(v) => context({ origin: v as PolicyScenario['context']['origin'] })}
            />
            <Choice
              label={t('Agente do cenário')}
              value={scenario.context.agentId ?? '__none'}
              choices={[
                { value: '__none', label: t('Qualquer agente') },
                ...(state.harness.library?.artifacts.filter((a) => a.kind === 'agent').map((a) => ({ value: a.id, label: a.name })) ?? []),
              ]}
              onChange={(v) => context({ agentId: v === '__none' ? null : v })}
            />
            <NumberField
              label={t('Tempo decorrido (segundos)')}
              value={scenario.elapsedMs / 1000}
              max={86400}
              onChange={(v) => change({ elapsedMs: v * 1000 })}
            />
            <NumberField
              label={t('Processos globais no cenário')}
              value={scenario.runningGlobal}
              onChange={(v) => change({ runningGlobal: v })}
            />
          </div>
          <label className="check">
            <Checkbox checked={scenario.explicit} onCheckedChange={(v) => change({ explicit: v === true })} />
            {t('Modelo escolhido à mão no card')}
          </label>
          <details className="fallback-advanced">
            <summary>{t('Processos em andamento por agente')}</summary>
            <div className="fallback-advanced-body">
              <div className="fallback-grid">
                {library.profiles.map((p) => (
                  <NumberField
                    key={p.id}
                    label={profileLabel(library, p.id)}
                    value={scenario.runningByProfile[p.id] ?? 0}
                    onChange={(v) => change({ runningByProfile: { ...scenario.runningByProfile, [p.id]: v } })}
                  />
                ))}
              </div>
            </div>
          </details>
        </div>
      </details>
      <div className="actions-toolbar">
        <Button disabled={simulate.busy || (!policy && !selected)} onClick={() => void simulate.run()}>
          {simulate.busy ? t('Simulando…') : t('Simular sem executar')}
        </Button>
      </div>
      {simulate.error && <p role="alert">{t(simulate.error)}</p>}
      {result && decision && (
        <div role="status" className="fallback-sentence">
          {result.inputs !== fingerprint && (
            <p className="muted">{t('Resultado desatualizado: simule novamente após alterar o cenário ou a política.')}</p>
          )}
          {decision.action === 'fallback' && decision.target ? (
            <p>
              <strong>{t('O board segue com {target}.', { target: targetLabel(library, decision.target) })}</strong>
              {decision.policy &&
                ` ${t('Pela regra {name} (versão {version}).', { name: ruleName(decision.policy.id), version: decision.policy.revision })}`}
            </p>
          ) : (
            <p>
              <strong>{t(REASON_LABELS[decision.reason] ?? decision.reason)}</strong>
              {decision.policy &&
                ` ${t('Pela regra {name} (versão {version}).', { name: ruleName(decision.policy.id), version: decision.policy.revision })}`}
            </p>
          )}
          {selected && decision.policy && decision.policy.id !== selected.id && (
            <p role="note">
              {t('A regra escolhida não decidiu: a decisão veio de {name}, que vem antes na lista.', {
                name: ruleName(decision.policy.id),
              })}
            </p>
          )}
          {selected && !decision.policy && <p role="note">{t('A regra escolhida não se aplica a este cenário.')}</p>}
          {decision.target && offTargetNote(library, decision.target.profileId) && (
            <p role="note">{offTargetNote(library, decision.target.profileId)}</p>
          )}
          {decision.alternatives.length > 0 && (
            <p>
              {t('Alternativas para você escolher: {targets}', {
                targets: decision.alternatives.map((a) => targetLabel(library, a)).join(', '),
              })}
            </p>
          )}
          {(result.value.problems.length > 0 || decision.rejected.length > 0) && (
            <ul className="muted">
              {result.value.problems.map((p, i) => (
                <li key={i}>
                  {t(p.code === 'cycle' ? 'Cadeia cíclica' : p.code === 'ambiguous-priority' ? 'Prioridade ambígua' : 'Destino inválido')}:{' '}
                  {p.policyIds.map(ruleName).join(' → ')}
                </li>
              ))}
              {decision.rejected.map((r, i) => (
                <li key={`rejected-${i}`}>
                  {targetLabel(library, r.target)}: {t(REASON_LABELS[r.reason] ?? r.reason)}
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            {t('Tentativa {number}', { number: decision.nextAttempt })}
            {decision.budget &&
              ` · ${t('limite da cadeia: {attempts} tentativas, prazo {seconds} s', {
                attempts: decision.budget.maxAttempts,
                seconds: decision.budget.deadlineAt / 1000,
              })}`}
          </p>
        </div>
      )}
    </section>
  );
}
