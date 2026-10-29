import { useState } from 'react';
import { Button, Card, IconButton, RadioGroup, Text, TextField } from '@radix-ui/themes';
import {
  POLICY_FAILURES,
  fallbackRuleProblem,
  validateExecutionPolicy,
  type ExecutionPolicy,
  type ExecutionPolicyRecord,
  type ExecutionTarget,
} from '../../../../shared/executionPolicies';
import { CONTEXT_ACTIONS } from '../../../../shared/executionAction';
import { CONTEXT_ACTION_LABELS } from '../../../../shared/executionAction';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { requestExecutionPolicy } from '../../../request';
import { useBoardStore } from '../../../store/boardStore';
import { executionPolicies } from '../../../commands';
import { useAction } from '../../../useAction';
import { t } from '../../../i18n';
import { FormField, IconArrowDown, IconArrowUp, IconPlus, IconTrash, SwitchField, Summary } from '../../ui';
import {
  Checks,
  Choice,
  NumberField,
  FAILURE_LABELS,
  HOW_LABELS,
  ORIGIN_LABELS,
  defaultName,
  offTargetNote,
  EMPTY_TARGET,
  originGroups,
  originConditions,
  originOf,
  profileLabel,
  ruleSentence,
  targetGroups,
  targetKeyOf,
  targetName,
} from './parts';
import { PolicySimulation } from './PolicySimulation';
import { PolicyAssistant } from './PolicyAssistant';

/**
 * O editor de uma regra de fallback, em três blocos (quando, usar no lugar, como trocar) e um Avançado fechado. Salvar
 * pela tela é a revisão humana (`reviewed: true`): o repositório já recusa a gravação por IA. O conflito de versão
 * (`expectedRevision`) mantém o rascunho e oferece recarregar a base.
 */
export function PolicyEditor({
  profileId,
  initial,
  base,
  library,
  onSaved,
  onReload,
  onCancel,
}: {
  /** o agente da tela: a regra é de um modelo dele */
  profileId: string;
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
  // o nome segue a origem e o destino até a pessoa escrever um
  const [named, setNamed] = useState(initial.name.trim() !== '' && initial.name !== defaultName(initial, library));
  const [validation, setValidation] = useState('');
  const [history, setHistory] = useState<{ records: ExecutionPolicyRecord[]; next: number | null } | null>(null);
  const name = (named ? draft.name.trim() : '') || defaultName(draft, library);
  const save = useAction(async () => {
    const policy = { ...draft, name };
    validateExecutionPolicy(policy);
    const problem = fallbackRuleProblem(policy);
    if (problem) throw new Error(problem);
    await executionPolicies.save(policy, baseVersion?.revision ?? 0, true);
    await onSaved();
  });
  const refreshBase = useAction(async () => {
    const latest = await onReload();
    const current = latest.snapshot.records.find((r) => r.policy.id === draft.id) ?? null;
    if (baseVersion && !current) throw new Error(t('A regra foi removida. Seu rascunho foi preservado.'));
    setBaseVersion(current);
    save.reset();
  });
  const readHistory = useAction(async (beforeRevision?: number) => {
    const reply = await requestExecutionPolicy({ type: 'executionPolicy.read', id: draft.id, beforeRevision });
    setHistory((old) => ({
      records: beforeRevision && old ? [...old.records, ...(reply.history ?? [])] : (reply.history ?? []),
      next: reply.nextBefore ?? null,
    }));
  });
  const change = (patch: Partial<ExecutionPolicy>) => {
    setDraft({ ...draft, ...patch });
    setValidation('');
  };
  const condition = (patch: Partial<ExecutionPolicy['conditions']>) => change({ conditions: { ...draft.conditions, ...patch } });
  const limit = (patch: Partial<ExecutionPolicy['limits']>) => change({ limits: { ...draft.limits, ...patch } });
  const updateTarget = (index: number, target: ExecutionTarget) =>
    change({ targets: draft.targets.map((old, i) => (i === index ? target : old)) });
  const swapTargets = (a: number, b: number) => {
    const targets = [...draft.targets];
    [targets[a], targets[b]] = [targets[b]!, targets[a]!];
    change({ targets });
  };
  // a origem vale só quando é um modelo deste agente; a regra antiga com outra origem abre sem origem escolhida
  const raw = originOf(draft.conditions);
  const originKey = raw !== null && raw.startsWith(`m:${profileId}:`) ? originConditions(raw) : null;
  const origin = originKey ? { profileId, model: originKey.models[0]! } : null;
  const origins = originGroups(library, profileId);
  const sameAsOrigin = (target: ExecutionTarget) => !!origin && origin.profileId === target.profileId && origin.model === target.model;
  const routing = ['auto', 'offer'].includes(draft.action);
  // o que impede salvar, na ordem em que a pessoa preenche
  const missing = !origin
    ? t('Escolha o modelo que falha.')
    : routing && !draft.targets.length
      ? t('Escolha ao menos um modelo para usar no lugar.')
      : routing && draft.targets.some((target) => !target.profileId)
        ? t('Escolha o modelo de cada linha de "Usar no lugar", ou remova a linha vazia.')
        : routing && draft.targets.some(sameAsOrigin)
          ? t('Um modelo de destino é o mesmo modelo que falha.')
          : null;
  const submit = () => {
    try {
      if (missing) throw new Error(missing);
      validateExecutionPolicy({ ...draft, name });
      setValidation('');
      void save.run();
    } catch (error) {
      setValidation(error instanceof Error ? error.message : String(error));
    }
  };
  const conflict = save.error?.includes('mudou') || save.error?.includes('changed');
  return (
    <Card className="draft-card fallback-editor" aria-label={t('Regra de fallback')}>
      <div className="fallback-editor-head">
        <FormField label={t('Nome da regra')}>
          {(id) => (
            <TextField.Root
              id={id}
              autoFocus
              value={named ? draft.name : ''}
              placeholder={origin ? defaultName(draft, library) : t('Sai do modelo que falha e do destino')}
              onChange={(e) => {
                setNamed(e.target.value !== '');
                change({ name: e.target.value });
              }}
            />
          )}
        </FormField>
        <SwitchField label={t('Ligada')} checked={draft.enabled} onChange={(enabled) => change({ enabled })} />
      </div>

      <section className="fallback-block">
        <h4>{t('1. Quando este modelo esgotar a cota')}</h4>
        <Choice
          label={t('Modelo que falha')}
          value={origin ? `m:${origin.profileId}:${origin.model}` : ''}
          placeholder={t('Escolha um modelo de {agent}', { agent: profileLabel(library, profileId) })}
          choices={[]}
          groups={origins}
          onChange={(v) => {
            if (v === raw) return;
            // outro modelo que falha: os destinos voltam ao começo, sem escolha (o antigo podia ser o novo modelo)
            change({
              conditions: { ...draft.conditions, ...originConditions(v) },
              targets: routing ? [EMPTY_TARGET] : [],
            });
          }}
        />
        <Text as="p" size="1" color="gray">
          {t('Só os modelos de {agent}: as regras desta tela são dele. Para outro modelo, monte outra regra.', {
            agent: profileLabel(library, profileId),
          })}
        </Text>
      </section>

      <section className="fallback-block">
        <h4>{t('2. Usar no lugar, nesta ordem')}</h4>
        {!routing && <p className="muted small">{t('Esta regra não troca de modelo (veja a ação em Avançado).')}</p>}
        {routing && (
          <ol className="fallback-targets">
            {draft.targets.map((target, index) => {
              const profile = library.profiles.find((p) => p.id === target.profileId);
              const option = library.models.find((m) => profile?.modelIds.includes(m.id) && m.model === target.model);
              const key = targetKeyOf(target);
              // cada linha oferece todos os modelos, menos o que falha e os escolhidos nas outras linhas
              const targets = targetGroups(
                library,
                origin,
                draft.targets.filter((other, i) => i !== index && other.profileId).map(targetKeyOf),
              );
              const known = !target.profileId || targets.some((g) => g.options.some((c) => c.value === key));
              const off = target.profileId ? offTargetNote(library, target.profileId) : null;
              return (
                <li key={index} className="fallback-target">
                  <span className="fallback-target-number">{index + 1}</span>
                  <Choice
                    label={t('Modelo {number}', { number: index + 1 })}
                    value={key}
                    placeholder={t('Escolha o modelo')}
                    disabled={!origin}
                    choices={known ? [] : [{ value: key, label: t('Ausente: {name}', { name: targetName(library, target) }) }]}
                    groups={targets}
                    onChange={(v) => {
                      const [profileId, model] = v.split('|');
                      const next = library.models.find(
                        (m) => m.model === model && library.profiles.find((p) => p.id === profileId)?.modelIds.includes(m.id),
                      );
                      updateTarget(index, { profileId: profileId!, model: model || null, effort: next?.defaultEffort ?? null });
                    }}
                  />
                  <Choice
                    label={t('Esforço')}
                    value={target.effort ?? '__default'}
                    disabled={!target.profileId}
                    choices={[
                      { value: '__default', label: t('Padrão do modelo') },
                      ...(option?.efforts.map((value) => ({ value, label: value })) ?? []),
                      ...(target.effort && !option?.efforts.includes(target.effort)
                        ? [{ value: target.effort, label: t('Ausente: {name}', { name: target.effort }) }]
                        : []),
                    ]}
                    onChange={(v) => updateTarget(index, { ...target, effort: v === '__default' ? null : v })}
                  />
                  <div className="row-actions">
                    <IconButton
                      variant="ghost"
                      color="gray"
                      title={t('Tentar antes')}
                      aria-label={t('Subir destino {number}', { number: index + 1 })}
                      disabled={index === 0}
                      onClick={() => swapTargets(index, index - 1)}
                    >
                      <IconArrowUp />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      color="gray"
                      title={t('Tentar depois')}
                      aria-label={t('Descer destino {number}', { number: index + 1 })}
                      disabled={index === draft.targets.length - 1}
                      onClick={() => swapTargets(index, index + 1)}
                    >
                      <IconArrowDown />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      color="red"
                      title={t('Remover da lista')}
                      aria-label={t('Remover destino {number}', { number: index + 1 })}
                      onClick={() => change({ targets: draft.targets.filter((_, i) => i !== index) })}
                    >
                      <IconTrash />
                    </IconButton>
                  </div>
                  {sameAsOrigin(target) && (
                    <p role="alert" className="fallback-target-note">
                      {t('É o mesmo modelo que falhou: escolha outro.')}
                    </p>
                  )}
                  {off && (
                    <p role="note" className="fallback-target-note">
                      {off}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {routing && (
          <div>
            <Button
              variant="soft"
              size="1"
              disabled={!origin || draft.targets.length >= 100 || draft.targets.some((target) => !target.profileId)}
              onClick={() => change({ targets: [...draft.targets, EMPTY_TARGET] })}
            >
              <IconPlus /> {t('Outro modelo')}
            </Button>
          </div>
        )}
        <Text as="p" size="1" color="gray">
          {t(
            'Vale qualquer modelo de qualquer agente, menos o que falha. A troca só acontece com o agente do destino ligado em Conectar agentes.',
          )}
        </Text>
      </section>

      <section className="fallback-block">
        <h4>{t('3. Como trocar')}</h4>
        <RadioGroup.Root
          value={routing ? draft.action : ''}
          onValueChange={(v) => change({ action: v as ExecutionPolicy['action'] })}
          aria-label={t('Como trocar')}
        >
          <Text as="label" size="2" className="fallback-how">
            <RadioGroup.Item value="auto" /> <b>{t(HOW_LABELS.auto)}</b>
            <span className="muted">{t('o card segue no próximo modelo sem perguntar')}</span>
          </Text>
          <Text as="label" size="2" className="fallback-how">
            <RadioGroup.Item value="offer" /> <b>{t(HOW_LABELS.offer)}</b>
            <span className="muted">{t('o card fica com você, com as opções na conversa')}</span>
          </Text>
        </RadioGroup.Root>
        {!routing && <p className="muted small">{t('Ação atual: {action} (em Avançado).', { action: t(HOW_LABELS[draft.action]) })}</p>}
      </section>

      <details className="fallback-advanced">
        <Summary>{t('Avançado')}</Summary>
        <div className="fallback-advanced-body">
          <Choice
            label={t('Ação')}
            value={draft.action}
            choices={(['auto', 'offer', 'block', 'wait'] as const).map((value) => ({ value, label: t(HOW_LABELS[value]) }))}
            onChange={(v) =>
              change({
                action: v as ExecutionPolicy['action'],
                ...(['block', 'wait'].includes(v) ? { targets: [] } : !draft.targets.length ? { targets: [EMPTY_TARGET] } : {}),
              })
            }
          />
          <Checks
            label={t('Tipos de falha')}
            hint={t('Hoje o board detecta só a cota esgotada; os outros tipos ficam para quando a execução os reportar.')}
            values={draft.conditions.failures}
            choices={POLICY_FAILURES.map((f) => ({ value: f, label: t(FAILURE_LABELS[f]) }))}
            onChange={(v) => condition({ failures: v })}
          />
          <Choice
            label={t('Modelo escolhido à mão no card')}
            value={draft.conditions.explicit}
            choices={[
              { value: 'include', label: t('Também troca, quando a origem for exatamente esse modelo') },
              { value: 'exclude', label: t('Nunca troca: a escolha da pessoa vale') },
              { value: 'only', label: t('Só troca escolhas à mão desse modelo') },
            ]}
            onChange={(v) => condition({ explicit: v as ExecutionPolicy['conditions']['explicit'] })}
          />
          <h5>{t('Só nestas situações (vazio = todas)')}</h5>
          <div className="fallback-grid">
            <Checks
              label={t('Ação da execução')}
              values={draft.conditions.actions}
              choices={CONTEXT_ACTIONS.map((value) => ({ value, label: t(CONTEXT_ACTION_LABELS[value]) }))}
              onChange={(v) => condition({ actions: v })}
            />
            <Checks
              label={t('Agente do harness')}
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
              label={t('Fase')}
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
              label={t('Tipo de card')}
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
              label={t('Quem chamou')}
              values={draft.conditions.origins}
              choices={Object.entries(ORIGIN_LABELS).map(([value, label]) => ({
                value: value as ExecutionPolicy['conditions']['origins'][number],
                label: t(label),
              }))}
              onChange={(v) => condition({ origins: v })}
            />
          </div>
          <h5>{t('Limites')}</h5>
          <div className="fallback-grid">
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
              label={t('Teto global de processos (0 = sem teto)')}
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
                label={t('Teto de processos: {profile} (0 = sem teto)', { profile: profileLabel(library, p.id) })}
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
            profileId={profileId}
            modes={['fallbacks', 'conflicts']}
            draft={draft}
            library={library}
            applyLabel={t('Usar proposta no rascunho')}
            onApply={(policy) => {
              // só substitui o rascunho local: salvar continua sendo a ação da pessoa
              setDraft(policy);
              setNamed(true);
              setValidation('');
            }}
          />
          <PolicySimulation profileId={profileId} policy={{ ...draft, name }} incomplete={missing} library={library} />
          {baseVersion && (
            <section>
              <h5>{t('Versões anteriores')}</h5>
              {!history && (
                <Button variant="soft" size="1" disabled={readHistory.busy} onClick={() => void readHistory.run()}>
                  {readHistory.busy ? t('Lendo histórico…') : t('Ver versões anteriores')}
                </Button>
              )}
              {history && (
                <ul className="fallback-history">
                  {history.records.map((row) => (
                    <li key={row.revision}>
                      {t('Versão {version}', { version: row.revision })} · {new Date(row.updatedAt).toLocaleString()} ·{' '}
                      {ruleSentence(row.policy, library)}{' '}
                      <Button
                        variant="ghost"
                        size="1"
                        onClick={() => {
                          setDraft(structuredClone(row.policy));
                          setNamed(true);
                          setValidation('');
                        }}
                      >
                        {t('Usar versão como rascunho')}
                      </Button>
                    </li>
                  ))}
                  {history.next !== null && (
                    <li>
                      <Button variant="ghost" size="1" disabled={readHistory.busy} onClick={() => void readHistory.run(history.next!)}>
                        {readHistory.busy ? t('Lendo histórico…') : t('Carregar versões anteriores')}
                      </Button>
                    </li>
                  )}
                </ul>
              )}
              {readHistory.error && <p role="alert">{t(readHistory.error)}</p>}
            </section>
          )}
        </div>
      </details>

      <p className="fallback-sentence">{origin ? ruleSentence({ ...draft, name }, library) : t('Escolha o modelo que falha.')}</p>
      {missing && origin && !validation && <p className="muted small">{missing}</p>}
      {validation && <p role="alert">{t(validation)}</p>}
      {save.error && (
        <p role="alert">
          {t(save.error)}{' '}
          {conflict && (
            <Button variant="soft" size="1" disabled={refreshBase.busy} onClick={() => void refreshBase.run()}>
              {refreshBase.busy ? t('Lendo regras…') : t('Recarregar e salvar de novo')}
            </Button>
          )}
        </p>
      )}
      {refreshBase.error && <p role="alert">{t(refreshBase.error)}</p>}
      <div className="form-actions">
        <Button variant="soft" color="gray" disabled={save.busy} onClick={onCancel}>
          {t('Cancelar')}
        </Button>
        <Button disabled={save.busy || refreshBase.busy || !!missing} title={missing ?? undefined} onClick={submit}>
          {save.busy ? t('Salvando…') : baseVersion ? t('Salvar regra') : t('Adicionar à lista')}
        </Button>
      </div>
    </Card>
  );
}
