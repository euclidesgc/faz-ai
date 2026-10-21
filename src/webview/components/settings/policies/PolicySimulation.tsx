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
import { Choice, NumberField, ORIGIN_LABELS, FAILURE_LABELS, REASON_LABELS, profileLabel, targetLabel } from './parts';

export function PolicySimulation({ policy, library }: { policy: ExecutionPolicy | null; library: PolicyLibrary }) {
  const state = useBoardStore((s) => s.state)!;
  const first = library.models[0];
  const [scenario, setScenario] = useState<Omit<PolicyScenario, 'draft'>>({
    sourceValue: first ? `${first.tool}:${first.model}${first.defaultEffort ? `@${first.defaultEffort}` : ''}` : '',
    defaultProfileId: state.board.aiTool,
    explicit: true,
    context: { action: 'work', origin: 'manual', agentId: null, phaseId: null, cardTypeId: null },
    failure: 'quota',
    effects: 'unknown',
    eligibility: 'blocked-admission',
    elapsedMs: 0,
    runningGlobal: 0,
    runningByProfile: {},
  });
  const [result, setResult] = useState<{ value: Simulation; inputs: string } | null>(null);
  const fingerprint = JSON.stringify([
    policy,
    scenario,
    library,
    state.executionPolicyRevision,
    state.board.modelCatalog,
    state.columns,
    state.cardTypes,
    state.harness.library?.artifacts,
  ]);
  const simulate = useAction(async () => {
    const response = await requestExecutionPolicy({ type: 'executionPolicy.simulate', scenario: { ...scenario, draft: policy } });
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
  return (
    <section aria-label={policy ? t('Simular política') : t('Próxima execução')}>
      <h4>{policy ? t('Simular política') : t('Próxima execução')}</h4>
      {!policy && <p className="muted">{t('Usa só as políticas salvas e ligadas, pelo mesmo avaliador da execução.')}</p>}
      <p className="muted">{t('Este cenário é hipotético. Não inicia IA, não grava o board e não comprova admissão ou credenciais.')}</p>
      <div className="context-contract-fields">
        <Choice
          label={t('Modelo de origem do cenário')}
          value={scenario.sourceValue || '__default'}
          choices={modelChoices}
          onChange={(v) => change({ sourceValue: v === '__default' ? '' : v })}
        />
        <Choice
          label={t('Perfil padrão do cenário')}
          value={scenario.defaultProfileId}
          choices={library.profiles.map((p) => ({ value: p.id, label: profileLabel(library, p.id) }))}
          onChange={(v) => change({ defaultProfileId: v })}
        />
        <Choice
          label={t('Falha do cenário')}
          value={scenario.failure}
          choices={POLICY_FAILURES.map((f) => ({ value: f, label: t(FAILURE_LABELS[f]) }))}
          onChange={(v) => change({ failure: v as PolicyScenario['failure'] })}
        />
        <Choice
          label={t('Efeitos da tentativa')}
          value={scenario.effects}
          choices={[
            { value: 'unknown', label: t('Desconhecidos') },
            { value: 'partial', label: t('Trabalho parcial') },
            { value: 'none', label: t('Ausência de efeitos comprovada no cenário') },
          ]}
          onChange={(v) => change({ effects: v as PolicyScenario['effects'] })}
        />
        <Choice
          label={t('Estado hipotético dos destinos')}
          value={scenario.eligibility}
          choices={[
            { value: 'blocked-admission', label: t('Sem admissão comprovada') },
            { value: 'pending-credentials', label: t('Credenciais pendentes') },
            { value: 'unavailable', label: t('Indisponíveis') },
            { value: 'admitted', label: t('Credenciais revisadas e admissão válida no cenário') },
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
            { value: '__none', label: t('Sem agente') },
            ...(state.harness.library?.artifacts.filter((a) => a.kind === 'agent').map((a) => ({ value: a.id, label: a.name })) ?? []),
          ]}
          onChange={(v) => context({ agentId: v === '__none' ? null : v })}
        />
        <Choice
          label={t('Fase do cenário')}
          value={scenario.context.phaseId ?? '__none'}
          choices={[
            { value: '__none', label: t('Sem fase') },
            ...state.columns.map((c) => ({
              value: c.id,
              label: `${state.workflows.find((w) => w.id === c.workflowId)?.name} · ${c.name}`,
            })),
          ]}
          onChange={(v) => context({ phaseId: v === '__none' ? null : v })}
        />
        <Choice
          label={t('Tipo do cenário')}
          value={scenario.context.cardTypeId ?? '__none'}
          choices={[{ value: '__none', label: t('Sem tipo') }, ...state.cardTypes.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(v) => context({ cardTypeId: v === '__none' ? null : v })}
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
        {library.profiles.map((p) => (
          <NumberField
            key={p.id}
            label={t('Processos no cenário: {profile}', { profile: profileLabel(library, p.id) })}
            value={scenario.runningByProfile[p.id] ?? 0}
            onChange={(v) => change({ runningByProfile: { ...scenario.runningByProfile, [p.id]: v } })}
          />
        ))}
      </div>
      <label className="check">
        <Checkbox checked={scenario.explicit} onCheckedChange={(v) => change({ explicit: v === true })} />
        {t('Modelo escolhido explicitamente pela pessoa')}
      </label>
      <Button disabled={simulate.busy} onClick={() => void simulate.run()}>
        {simulate.busy ? t('Simulando…') : t('Simular sem executar')}
      </Button>
      {simulate.error && <p role="alert">{t(simulate.error)}</p>}
      {result && (
        <div role="status">
          {result.inputs !== fingerprint && <p>{t('Resultado desatualizado: simule novamente após alterar o cenário ou a política.')}</p>}
          <h4>{t('Decisão do cenário')}</h4>
          <p>{t(REASON_LABELS[result.value.decision.reason] ?? result.value.decision.reason)}</p>
          {result.value.decision.policy && (
            <p>
              {t('Regra: {name} · versão {version}', {
                name:
                  result.value.decision.policy.id === policy?.id
                    ? policy.name
                    : (library.snapshot.records.find((r) => r.policy.id === result.value.decision.policy!.id)?.policy.name ??
                      result.value.decision.policy.id),
                version: result.value.decision.policy.revision,
              })}
            </p>
          )}
          {result.value.decision.target && (
            <p>{t('Próximo destino: {target}', { target: targetLabel(library, result.value.decision.target) })}</p>
          )}
          <p>{t('Próxima tentativa: {number}', { number: result.value.decision.nextAttempt })}</p>
          <p>{t('Consumo da tentativa anterior: desconhecido neste cenário.')}</p>
          {result.value.decision.budget && (
            <p>
              {t('Limite da cadeia: {attempts} tentativas · prazo {seconds} segundos', {
                attempts: result.value.decision.budget.maxAttempts,
                seconds: result.value.decision.budget.deadlineAt / 1000,
              })}
            </p>
          )}
          <ul>
            {result.value.problems.map((p, i) => (
              <li key={i}>
                {t(p.code === 'cycle' ? 'Cadeia cíclica' : p.code === 'ambiguous-priority' ? 'Prioridade ambígua' : 'Destino inválido')}:{' '}
                {p.policyIds
                  .map((id) =>
                    id === policy?.id ? policy.name : (library.snapshot.records.find((r) => r.policy.id === id)?.policy.name ?? id),
                  )
                  .join(' → ')}
              </li>
            ))}
            {result.value.decision.rejected.map((r, i) => (
              <li key={`rejected-${i}`}>
                {targetLabel(library, r.target)}: {t(REASON_LABELS[r.reason] ?? r.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
