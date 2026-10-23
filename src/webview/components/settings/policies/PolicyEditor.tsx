import { useState } from 'react';
import { Button, Checkbox, TextField } from '@radix-ui/themes';
import {
  POLICY_FAILURES,
  validateExecutionPolicy,
  type ExecutionPolicy,
  type ExecutionPolicyRecord,
  type ExecutionTarget,
} from '../../../../shared/executionPolicies';
import { CONTEXT_ACTIONS } from '../../../../shared/contextPlanning';
import { CONTEXT_ACTION_LABELS } from '../../../../shared/contextPlan';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { useBoardStore } from '../../../store/boardStore';
import { executionPolicies } from '../../../commands';
import { useAction } from '../../../useAction';
import { t } from '../../../i18n';
import { FormField } from '../../ui';
import {
  Checks,
  Choice,
  NumberField,
  PolicySummary,
  FAILURE_LABELS,
  POLICY_ACTION_LABELS,
  ORIGIN_LABELS,
  offTargetNote,
  profileLabel,
} from './parts';
import { PolicySimulation } from './PolicySimulation';
import { PolicyAssistant } from './PolicyAssistant';

export function PolicyEditor({
  initial,
  base,
  library,
  onSaved,
  onReload,
  onCancel,
}: {
  initial: ExecutionPolicy;
  base: ExecutionPolicyRecord | null;
  library: PolicyLibrary;
  onSaved(): Promise<void>;
  onReload(): Promise<PolicyLibrary>;
  onCancel(): void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [baseVersion, setBaseVersion] = useState(base);
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [compare, setCompare] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [validation, setValidation] = useState('');
  const save = useAction(async (review: boolean) => {
    await executionPolicies.save(draft, baseVersion?.revision ?? 0, review);
    await onSaved();
  });
  const refreshBase = useAction(async () => {
    const latest = await onReload();
    const current = latest.snapshot.records.find((r) => r.policy.id === draft.id) ?? null;
    if (baseVersion && !current) throw new Error(t('A política foi removida. Seu rascunho foi preservado.'));
    setBaseVersion(current);
    setReviewed(false);
    setCompare(false);
  });
  const change = (patch: Partial<ExecutionPolicy>) => setDraft({ ...draft, ...patch });
  const condition = (patch: Partial<ExecutionPolicy['conditions']>) => change({ conditions: { ...draft.conditions, ...patch } });
  const limit = (patch: Partial<ExecutionPolicy['limits']>) => change({ limits: { ...draft.limits, ...patch } });
  const updateTarget = (index: number, target: ExecutionTarget) =>
    change({ targets: draft.targets.map((old, i) => (i === index ? target : old)) });
  const modelCodes = [
    ...new Set(library.models.map((m) => m.model)),
    ...draft.conditions.models.filter((m): m is string => m !== null && !library.models.some((o) => o.model === m)),
  ];
  const compareChanges = () => {
    try {
      validateExecutionPolicy(draft);
      setValidation('');
      setReviewed(false);
      setCompare(true);
    } catch (error) {
      setValidation(error instanceof Error ? error.message : String(error));
    }
  };
  if (compare)
    return (
      <>
        <p>{t('Compare todas as condições e limites antes de confirmar. A revisão desta versão não comprova admissão de executores.')}</p>
        <div className="context-contract-fields">
          <section>
            <h3>{t('Configuração atual')}</h3>
            {baseVersion ? <PolicySummary policy={baseVersion.policy} library={library} /> : <p>{t('Política nova')}</p>}
          </section>
          <section>
            <h3>{t('Proposta revisável')}</h3>
            <PolicySummary policy={draft} library={library} />
          </section>
        </div>
        <label className="check">
          <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} />
          {t('Revisei as condições, os destinos e os limites desta versão')}
        </label>
        {(save.error || refreshBase.error) && <p role="alert">{t(refreshBase.error ?? save.error!)}</p>}
        <div className="actions">
          <Button variant="soft" disabled={save.busy || refreshBase.busy} onClick={() => void refreshBase.run()}>
            {refreshBase.busy ? t('Lendo políticas…') : t('Recarregar versão para comparar')}
          </Button>
          <Button variant="soft" disabled={save.busy || refreshBase.busy} onClick={() => setCompare(false)}>
            {t('Voltar à edição')}
          </Button>
          <Button variant="soft" disabled={save.busy || refreshBase.busy} onClick={() => void save.run(false)}>
            {save.busy ? t('Salvando…') : t('Salvar como pendente de revisão')}
          </Button>
          <Button disabled={save.busy || refreshBase.busy || !reviewed} onClick={() => void save.run(true)}>
            {save.busy ? t('Salvando…') : t('Confirmar revisão e salvar')}
          </Button>
        </div>
      </>
    );
  return (
    <>
      <div className="context-contract-fields">
        <FormField label={t('Nome da política')}>
          {(id) => <TextField.Root id={id} value={draft.name} onChange={(e) => change({ name: e.target.value })} />}
        </FormField>
        <NumberField label={t('Prioridade (menor primeiro)')} value={draft.priority} onChange={(v) => change({ priority: v })} />
        <Choice
          label={t('Ação da política')}
          value={draft.action}
          choices={Object.entries(POLICY_ACTION_LABELS).map(([value, label]) => ({ value, label: t(label) }))}
          onChange={(v) => change({ action: v as ExecutionPolicy['action'], ...(['block', 'wait'].includes(v) ? { targets: [] } : {}) })}
        />
        <Choice
          label={t('Escolhas explícitas')}
          value={draft.conditions.explicit}
          choices={[
            { value: 'exclude', label: t('Preservar escolhas explícitas') },
            { value: 'include', label: t('Incluir quando perfil e modelo corresponderem') },
            { value: 'only', label: t('Somente escolhas explícitas correspondentes') },
          ]}
          onChange={(v) => condition({ explicit: v as ExecutionPolicy['conditions']['explicit'] })}
        />
      </div>
      <label className="check">
        <Checkbox checked={draft.enabled} onCheckedChange={(v) => change({ enabled: v === true })} />
        {t('Definição ligada')}
      </label>
      <p className="muted">
        {t(
          'Listas vazias correspondem a qualquer valor. Para trocar uma escolha explícita, selecione também seu perfil e modelo de origem.',
        )}
      </p>
      <div className="context-contract-fields">
        <Checks
          label={t('Perfis de origem')}
          values={draft.conditions.profileIds}
          choices={[
            ...library.profiles.map((p) => ({ value: p.id, label: profileLabel(library, p.id) })),
            ...draft.conditions.profileIds
              .filter((id) => !library.profiles.some((p) => p.id === id))
              .map((id) => ({ value: id, label: profileLabel(library, id) })),
          ]}
          onChange={(v) => condition({ profileIds: v })}
        />
        <Checks
          label={t('Modelos de origem')}
          values={draft.conditions.models}
          choices={[{ value: null, label: t('Modelo padrão') }, ...modelCodes.map((value) => ({ value, label: value }))]}
          onChange={(v) => condition({ models: v })}
        />
        <Checks
          label={t('Falhas')}
          values={draft.conditions.failures}
          choices={POLICY_FAILURES.map((f) => ({ value: f, label: t(FAILURE_LABELS[f]) }))}
          onChange={(v) => condition({ failures: v })}
        />
        <Checks
          label={t('Ações de origem')}
          values={draft.conditions.actions}
          choices={CONTEXT_ACTIONS.map((value) => ({ value, label: t(CONTEXT_ACTION_LABELS[value]) }))}
          onChange={(v) => condition({ actions: v })}
        />
        <Checks
          label={t('Agentes de origem')}
          values={draft.conditions.agentIds}
          choices={[
            ...(state.harness.library?.artifacts.filter((a) => a.kind === 'agent').map((a) => ({ value: a.id, label: a.name })) ?? []),
            ...draft.conditions.agentIds
              .filter((id) => !state.harness.library?.artifacts.some((a) => a.id === id))
              .map((id) => ({ value: id, label: t('Ausente: {name}', { name: id }) })),
          ]}
          onChange={(v) => condition({ agentIds: v })}
        />
        <Checks
          label={t('Fases de origem')}
          values={draft.conditions.phaseIds}
          choices={[
            ...state.columns.map((c) => ({
              value: c.id,
              label: `${state.workflows.find((w) => w.id === c.workflowId)?.name} · ${c.name}`,
            })),
            ...draft.conditions.phaseIds
              .filter((id) => !state.columns.some((c) => c.id === id))
              .map((id) => ({ value: id, label: t('Ausente: {name}', { name: id }) })),
          ]}
          onChange={(v) => condition({ phaseIds: v })}
        />
        <Checks
          label={t('Tipos de origem')}
          values={draft.conditions.cardTypeIds}
          choices={[
            ...state.cardTypes.map((c) => ({ value: c.id, label: c.name })),
            ...draft.conditions.cardTypeIds
              .filter((id) => !state.cardTypes.some((c) => c.id === id))
              .map((id) => ({ value: id, label: t('Ausente: {name}', { name: id }) })),
          ]}
          onChange={(v) => condition({ cardTypeIds: v })}
        />
        <Checks
          label={t('Origens da chamada')}
          values={draft.conditions.origins}
          choices={Object.entries(ORIGIN_LABELS).map(([value, label]) => ({
            value: value as ExecutionPolicy['conditions']['origins'][number],
            label: t(label),
          }))}
          onChange={(v) => condition({ origins: v })}
        />
      </div>
      {['auto', 'offer'].includes(draft.action) && (
        <section>
          <h4>{t('Destinos ordenados')}</h4>
          {draft.targets.map((target, index) => {
            const p = library.profiles.find((p) => p.id === target.profileId);
            const models = library.models.filter((m) => p?.modelIds.includes(m.id));
            const selected = models.find((m) => m.model === target.model);
            return (
              <fieldset key={index}>
                <legend>{t('Destino {number}', { number: index + 1 })}</legend>
                <div className="context-contract-fields">
                  <Choice
                    label={t('Perfil do destino {number}', { number: index + 1 })}
                    value={target.profileId}
                    choices={[
                      ...library.profiles.map((p) => ({ value: p.id, label: profileLabel(library, p.id) })),
                      ...(!p ? [{ value: target.profileId, label: profileLabel(library, target.profileId) }] : []),
                    ]}
                    onChange={(v) => updateTarget(index, { profileId: v, model: null, effort: null })}
                  />
                  <Choice
                    label={t('Modelo do destino {number}', { number: index + 1 })}
                    value={target.model ?? '__default'}
                    choices={[
                      { value: '__default', label: t('Modelo padrão') },
                      ...models.map((m) => ({ value: m.model, label: m.label })),
                      ...(target.model !== null && !selected
                        ? [{ value: target.model, label: t('Ausente: {name}', { name: target.model }) }]
                        : []),
                    ]}
                    onChange={(v) => updateTarget(index, { ...target, model: v === '__default' ? null : v, effort: null })}
                  />
                  <Choice
                    label={t('Esforço do destino {number}', { number: index + 1 })}
                    value={target.effort ?? '__default'}
                    choices={[
                      { value: '__default', label: t('Padrão do modelo') },
                      ...(selected?.efforts.map((value) => ({ value, label: value })) ?? []),
                      ...(target.effort && !selected?.efforts.includes(target.effort)
                        ? [{ value: target.effort, label: t('Ausente: {name}', { name: target.effort }) }]
                        : []),
                    ]}
                    onChange={(v) => updateTarget(index, { ...target, effort: v === '__default' ? null : v })}
                  />
                </div>
                {offTargetNote(library, target.profileId) && <p role="note">{offTargetNote(library, target.profileId)}</p>}
                <div className="actions">
                  <Button
                    size="1"
                    variant="soft"
                    disabled={index === 0}
                    onClick={() => {
                      const targets = [...draft.targets];
                      [targets[index - 1], targets[index]] = [targets[index]!, targets[index - 1]!];
                      change({ targets });
                    }}
                  >
                    {t('Subir destino')}
                  </Button>
                  <Button
                    size="1"
                    variant="soft"
                    disabled={index === draft.targets.length - 1}
                    onClick={() => {
                      const targets = [...draft.targets];
                      [targets[index], targets[index + 1]] = [targets[index + 1]!, targets[index]!];
                      change({ targets });
                    }}
                  >
                    {t('Descer destino')}
                  </Button>
                  <Button size="1" variant="soft" onClick={() => change({ targets: draft.targets.filter((_, i) => i !== index) })}>
                    {t('Remover destino')}
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <Button
            variant="soft"
            disabled={draft.targets.length >= 100}
            onClick={() => {
              const model = library.models.find(
                (m) =>
                  !draft.conditions.models.includes(m.model) &&
                  !draft.targets.some((target) => target.profileId === m.tool && target.model === m.model),
              );
              change({
                targets: [
                  ...draft.targets,
                  model
                    ? { profileId: model.tool, model: model.model, effort: model.defaultEffort }
                    : { profileId: library.profiles[0]!.id, model: null, effort: null },
                ],
              });
            }}
          >
            {t('Adicionar destino')}
          </Button>
        </section>
      )}
      <h4>{t('Limites da cadeia')}</h4>
      <div className="context-contract-fields">
        <NumberField
          label={t('Máximo de tentativas')}
          min={1}
          max={100}
          value={draft.limits.maxAttempts}
          onChange={(v) => limit({ maxAttempts: v })}
        />
        <NumberField
          label={t('Prazo da cadeia (segundos)')}
          min={1}
          max={86400}
          value={draft.limits.maxElapsedMs / 1000}
          onChange={(v) => limit({ maxElapsedMs: v * 1000 })}
        />
        <NumberField
          label={t('Intervalo entre tentativas (segundos)')}
          max={86400}
          value={draft.limits.backoffMs / 1000}
          onChange={(v) => limit({ backoffMs: v * 1000 })}
        />
        <NumberField
          label={t('Teto global de processos (0 = sem teto adicional)')}
          max={10000}
          value={draft.limits.globalProcesses ?? 0}
          onChange={(v) => limit({ globalProcesses: v === 0 ? null : v })}
        />
        {[
          ...library.profiles,
          ...Object.keys(draft.limits.perProfile)
            .filter((id) => !library.profiles.some((p) => p.id === id))
            .map((id) => ({ id })),
        ].map((p) => (
          <NumberField
            key={p.id}
            label={t('Teto de processos: {profile} (0 = sem teto adicional)', { profile: profileLabel(library, p.id) })}
            max={10000}
            value={draft.limits.perProfile[p.id] ?? 0}
            onChange={(v) => {
              const perProfile = { ...draft.limits.perProfile };
              if (v === 0) delete perProfile[p.id];
              else perProfile[p.id] = v;
              limit({ perProfile });
            }}
          />
        ))}
      </div>
      <PolicyAssistant
        modes={['fallbacks', 'conflicts']}
        draft={draft}
        library={library}
        applyLabel={t('Usar proposta no rascunho')}
        onApply={(policy) => {
          // só substitui o rascunho local: salvar continua exigindo comparar e confirmar
          setDraft(policy);
          setValidation('');
        }}
      />
      <PolicySimulation policy={draft} library={library} />
      {validation && <p role="alert">{t(validation)}</p>}
      <div className="actions">
        <Button variant="soft" onClick={onCancel}>
          {t('Descartar alterações')}
        </Button>
        <Button onClick={compareChanges}>{t('Comparar política antes de salvar')}</Button>
      </div>
    </>
  );
}
