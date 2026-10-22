import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, Checkbox, Select } from '@radix-ui/themes';
import type { Card } from '../../../shared/model';
import type { ActivityContextWrite, ContextActivityTarget } from '../../../shared/contextPlanning';
import { CONTEXT_ACTIONS } from '../../../shared/contextPlanning';
import {
  activityDraft,
  cardContextTargets,
  contextTargetKey,
  planPreview,
  estimateContextDraft,
  CONTEXT_ACTION_LABELS,
  CARD_CONTEXT_ACTIONS,
  withContextDrafts,
} from '../../../shared/contextPlan';
import { useBoardStore } from '../../store/boardStore';
import { contextPlanning } from '../../commands';
import { useAction } from '../../useAction';
import { requestContextProposal } from '../../request';
import { isProposalStale, type ContextProposal } from '../../../shared/contextProposal';
import { getLocale, t } from '../../i18n';
import { ActivityContextEditor } from './ActivityContextEditor';
import { ContextDraftPreview, CONTEXT_DRAFT_ORIGINS } from './ContextDraftPreview';

export type ExecutionPlanDrafts = Record<string, ActivityContextWrite>;
/** O card guarda o rascunho acima das abas. Padrões sem card usam a mesma composição. */
export function ExecutionPlanPanel({
  card,
  workflowId = null,
  drafts,
  onDrafts,
}: {
  card?: Card;
  workflowId?: string | null;
  drafts: ExecutionPlanDrafts;
  onDrafts: Dispatch<SetStateAction<ExecutionPlanDrafts>>;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [editing, setEditing] = useState<ContextActivityTarget | null>(null);
  const [review, setReview] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Record<string, ContextProposal>>({});
  useEffect(() => {
    setPicked([]);
    setProposals({});
    setEditing(null);
    setReview(false);
  }, [workflowId, card?.id]);
  const allDrafts = Object.values(drafts);
  const overlay = withContextDrafts(state, allDrafts);
  const targets = card
    ? cardContextTargets(state, card)
    : (workflowId ? CARD_CONTEXT_ACTIONS : [...CONTEXT_ACTIONS]).map((action) => ({ cardId: null, workflowId, phaseId: '', action }));
  if (!card && workflowId)
    targets.splice(
      1,
      0,
      ...state.columns
        .filter((p) => p.workflowId === workflowId && !p.isTerminal)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ cardId: null, workflowId, phaseId: p.id, action: 'work' as const })),
    );
  const name = (target: ContextActivityTarget) =>
    (target.cardId
      ? ''
      : `${target.workflowId ? (state.workflows.find((w) => w.id === target.workflowId)?.name ?? target.workflowId) : t('Padrão do board')} · `) +
    (target.phaseId
      ? `${t(CONTEXT_ACTION_LABELS[target.action])} · ${state.columns.find((p) => p.id === target.phaseId)?.name ?? target.phaseId}`
      : t(CONTEXT_ACTION_LABELS[target.action]));
  const draftOf = (target: ContextActivityTarget) => drafts[contextTargetKey(target)] ?? activityDraft(state, target);
  const label = (field: keyof ActivityContextWrite['selection'], value: ActivityContextWrite['selection'][typeof field]): string => {
    if (value && typeof value === 'object' && 'mode' in value) {
      if (value.mode === 'inherit') return t('Herdar');
      const explicit = value.value;
      if (Array.isArray(explicit))
        return explicit.map((id) => state.harness.library?.artifacts.find((a) => a.id === id)?.name ?? id).join(', ') || t('Nenhum');
      if (field === 'agent')
        return state.harness.library?.artifacts.find((a) => a.id === explicit)?.name ?? (explicit || t('Nenhum agente'));
      return explicit || t('Vazio explícito');
    }
    return Array.isArray(value)
      ? value.map((id) => state.attachments.find((a) => a.id === id)?.filename ?? id).join(', ') || t('Nenhum')
      : String(value);
  };
  const fieldLabels = {
    agent: 'Agente',
    model: 'Modelo',
    additionalSkillIds: 'Skills adicionais',
    activeMcpIds: 'MCPs ativos',
    inputAttachmentIds: 'Entradas da atividade',
    expectedResult: 'Resultado esperado',
  } as const;
  const save = useAction(async () => {
    await contextPlanning.saveBatch(allDrafts);
    onDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key, value]) => !allDrafts.some((d) => contextTargetKey(d.target) === key && JSON.stringify(d) === JSON.stringify(value)),
        ),
      ),
    );
    setReview(false);
    setPicked([]);
  });
  const propose = useAction(async (target: ContextActivityTarget) => {
    const proposal = await requestContextProposal(target, getLocale(), (state.board.runner.timeoutMinutes + 1) * 60_000);
    setProposals((current) => ({ ...current, [contextTargetKey(target)]: proposal }));
  });
  /** Só vira rascunho: a pessoa compara e aplica pelo fluxo de sempre. Agente, contrato e prioridades não mudam. */
  const applyProposal = (proposal: ContextProposal) => {
    const key = contextTargetKey(proposal.target);
    const base = draftOf(proposal.target);
    const reasons = [...proposal.additionalSkills, ...proposal.activeMcps].map(
      (i) => `${state.harness.library?.artifacts.find((a) => a.id === i.artifactId)?.name ?? i.artifactId}: ${i.reason}`,
    );
    modify({
      ...base,
      selection: {
        ...base.selection,
        additionalSkillIds: { mode: 'explicit', value: proposal.additionalSkills.map((i) => i.artifactId) },
        activeMcpIds: { mode: 'explicit', value: proposal.activeMcps.map((i) => i.artifactId) },
      },
      reason: [proposal.explanation, ...reasons].filter(Boolean).join('\n'),
    });
    setProposals(({ [key]: _used, ...rest }) => rest);
  };
  const stale = !save.busy && allDrafts.some((d) => activityDraft(state, d.target).expectedRevision !== d.expectedRevision);
  const copySource = targets.find((target) => contextTargetKey(target) === picked[0]);
  const modify = (value: ActivityContextWrite) => {
    save.reset();
    onDrafts((current) => ({ ...current, [contextTargetKey(value.target)]: value }));
    setReview(false);
  };
  const copy = () => {
    const source = copySource;
    if (!source) return;
    const value = draftOf(source);
    const next = { ...drafts };
    // Cada destino mantém sua revisão e identidade. A cópia é um rascunho sujeito à comparação.
    for (const target of targets.filter((target) => picked.includes(contextTargetKey(target))))
      next[contextTargetKey(target)] = { ...draftOf(target), selection: structuredClone(value.selection), reason: value.reason };
    onDrafts(next);
    setReview(false);
  };
  return (
    <section className="execution-plan" aria-label={t('Plano de execução')}>
      <h3>{t('Plano de execução')}</h3>
      <p className="muted small">
        {t('Planeje cada ação separadamente. Os contratos ainda são rascunhos e não governam a execução legada.')}
      </p>
      <div className="context-plan-table-wrap">
        <table className="context-plan-table">
          <thead>
            <tr>
              <th>{t('Selecionar')}</th>
              <th>{t('Ação ou fase')}</th>
              <th>{t('Agente e modelo')}</th>
              <th>{t('Recursos e resultado')}</th>
              <th>{t('Contexto inicial conhecido')}</th>
              <th>{t('Configuração')}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => {
              const key = contextTargetKey(target);
              const p = planPreview(state, target, allDrafts);
              const agent = state.harness.library?.artifacts.find((a) => a.id === p.agent?.artifactId);
              const estimate = estimateContextDraft(overlay, p);
              const changed = !!drafts[key];
              return (
                <tr key={key}>
                  <td>
                    <Checkbox
                      aria-label={t('Selecionar {activity}', { activity: name(target) })}
                      checked={picked.includes(key)}
                      onCheckedChange={(checked) => setPicked(checked ? [...picked, key] : picked.filter((v) => v !== key))}
                      disabled={save.busy}
                    />
                  </td>
                  <th scope="row">
                    {name(target)}
                    {changed && <span className="muted small"> · {t('Rascunho')}</span>}
                  </th>
                  <td>
                    {agent?.name ?? t('Sem agente válido')}
                    <br />
                    <span className="muted small">
                      {p.model.choice.mode === 'inherit' ? t('Herdar modelo') : p.model.choice.value || t('Vazio explícito')}
                    </span>
                  </td>
                  <td>
                    <dl>
                      <dt>{t('Skills')}</dt>
                      <dd>
                        {p.items
                          .filter((i) => i.kind === 'skill')
                          .map((i) => i.name)
                          .join(', ') || t('Nenhuma')}
                      </dd>
                      <dt>{t('MCPs ativos')}</dt>
                      <dd>
                        {p.items
                          .filter((i) => i.kind === 'mcp')
                          .map((i) => i.name)
                          .join(', ') || t('Nenhum')}
                      </dd>
                      <dt>{t('Entradas da atividade')}</dt>
                      <dd>
                        {p.inputAttachmentIds.map((id) => state.attachments.find((a) => a.id === id)?.filename ?? id).join(', ') ||
                          t('Nenhuma')}
                      </dd>
                      <dt>{t('Resultado esperado')}</dt>
                      <dd>{p.expectedResult || t('Nenhum')}</dd>
                    </dl>
                  </td>
                  <td>
                    {t('Cerca de {tokens} tokens conhecidos', { tokens: estimate.knownTokens })}
                    <br />
                    <span className="muted small">{t('{n} itens sem medida', { n: estimate.unknownIds.length })}</span>
                  </td>
                  <td>
                    <Button size="1" variant="soft" disabled={save.busy} onClick={() => setEditing(target)}>
                      {t('Configurar {activity}', { activity: name(target) })}
                    </Button>{' '}
                    {planPreview(state, target).agent && (
                      <Button
                        size="1"
                        variant="ghost"
                        disabled={save.busy || propose.busy}
                        onClick={() => void propose.run(target)}
                        aria-label={t('Propor configuração de {activity} com IA', { activity: name(target) })}
                      >
                        {propose.busy ? t('Pedindo proposta…') : t('Propor com IA')}
                      </Button>
                    )}
                    <details>
                      <summary>{t('Origens e incompatibilidades')}</summary>
                      <ContextDraftPreview preview={p} />
                      <ul>
                        {p.trace
                          .filter((tr) => tr.selectionId)
                          .map((tr) => (
                            <li key={tr.origin}>
                              {t(CONTEXT_DRAFT_ORIGINS[tr.origin])} · {t('Revisão {revision}', { revision: tr.revision ?? 0 })}
                            </li>
                          ))}
                      </ul>
                      {draftOf(target).reason && <p>{draftOf(target).reason}</p>}
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {t(
          'A estimativa cobre só o texto conhecido. MCPs, anexos e arquivos de apoio podem acrescentar contexto; consumo total continua desconhecido.',
        )}
      </p>
      {propose.error && <p role="alert">{t(propose.error)}</p>}
      {Object.entries(proposals).map(([key, proposal]) => {
        const target = targets.find((tg) => contextTargetKey(tg) === key);
        if (!target) return null;
        const outdated = isProposalStale(state, proposal);
        const artifactName = (id: string) => state.harness.library?.artifacts.find((a) => a.id === id)?.name ?? id;
        return (
          <section key={key} className="context-plan-proposal" aria-label={t('Proposta da IA para {activity}', { activity: name(target) })}>
            <h4>{t('Proposta da IA para {activity}', { activity: name(target) })}</h4>
            <p className="muted small">
              {t('A IA só sugere skills e MCPs dentro do que o agente permite. Nada é gravado até você comparar e aplicar.')}
            </p>
            {proposal.explanation && <p>{proposal.explanation}</p>}
            <ul>
              {proposal.additionalSkills.map((i) => (
                <li key={`s-${i.artifactId}`}>
                  {t('Skill')} {artifactName(i.artifactId)}: {i.reason}
                </li>
              ))}
              {proposal.activeMcps.map((i) => (
                <li key={`m-${i.artifactId}`}>
                  {t('MCP')} {artifactName(i.artifactId)}: {i.reason}
                </li>
              ))}
              {proposal.additionalSkills.length + proposal.activeMcps.length === 0 && (
                <li>{t('Nenhuma skill ou MCP além do essencial.')}</li>
              )}
            </ul>
            {outdated && (
              <p role="alert">{t('A proposta está desatualizada: o card, o agente ou o catálogo mudaram. Peça uma nova proposta.')}</p>
            )}
            <Button disabled={outdated || save.busy} onClick={() => applyProposal(proposal)}>
              {t('Usar como rascunho')}
            </Button>{' '}
            <Button variant="ghost" onClick={() => setProposals(({ [key]: _gone, ...rest }) => rest)}>
              {t('Descartar proposta')}
            </Button>
          </section>
        );
      })}
      {picked.length > 1 && copySource && (
        <Button variant="soft" disabled={save.busy} onClick={copy}>
          {t('Copiar {activity} para as atividades marcadas', { activity: name(copySource!) })}
        </Button>
      )}
      {allDrafts.length > 0 && (
        <div className="context-plan-review">
          {stale && (
            <p role="alert">
              {t('Uma configuração mudou em outra edição. Preserve seu rascunho e releia as revisões antes de aplicar.')}
              <Button
                variant="soft"
                disabled={save.busy}
                onClick={() => {
                  onDrafts((current) =>
                    Object.fromEntries(
                      Object.entries(current).map(([key, draft]) => [
                        key,
                        { ...draft, expectedRevision: activityDraft(state, draft.target).expectedRevision },
                      ]),
                    ),
                  );
                  setReview(false);
                  save.reset();
                }}
              >
                {t('Atualizar revisões e comparar')}
              </Button>
            </p>
          )}
          {!review ? (
            <Button disabled={save.busy || stale} onClick={() => setReview(true)}>
              {t('Comparar alterações ({n})', { n: allDrafts.length })}
            </Button>
          ) : (
            <>
              <h4>{t('Revise antes de aplicar')}</h4>
              {allDrafts.map((d) => {
                const old = activityDraft(state, d.target);
                const current = planPreview(state, d.target);
                const next = planPreview(state, d.target, allDrafts);
                const before = estimateContextDraft(state, current);
                const after = estimateContextDraft(overlay, next);
                return (
                  <section key={contextTargetKey(d.target)} aria-label={name(d.target)}>
                    <strong>{name(d.target)}</strong>
                    <ul>
                      {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[])
                        .filter((f) => JSON.stringify(old.selection[f]) !== JSON.stringify(d.selection[f]))
                        .map((f) => (
                          <li key={f}>
                            {t(fieldLabels[f])}: {label(f, old.selection[f])} → {label(f, d.selection[f])}
                          </li>
                        ))}
                    </ul>
                    <p>{t('Parcela conhecida: {before} → {after} tokens', { before: before.knownTokens, after: after.knownTokens })}</p>
                    <p>{t('Itens sem medida: {before} → {after}', { before: before.unknownIds.length, after: after.unknownIds.length })}</p>
                    <p>{d.reason || t('Sem justificativa informada')}</p>
                  </section>
                );
              })}
              <Button disabled={save.busy || stale} onClick={() => void save.run()}>
                {save.busy ? t('Salvando…') : t('Aplicar rascunhos revisados')}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={save.busy}
            onClick={() => {
              onDrafts({});
              setReview(false);
            }}
          >
            {t('Descartar rascunhos do plano')}
          </Button>
        </div>
      )}
      {save.error && <p role="alert">{t(save.error)}</p>}
      {card && (
        <section aria-label={t('Referências de conclusão')}>
          <h4>{t('Referências de conclusão')}</h4>
          <p className="muted small">{t('Critérios e dependências são lidos do card; editar o plano não cria cópias.')}</p>
          <ul>
            {state.checklistItems
              .filter((i) => i.cardId === card.id)
              .map((i) => (
                <li key={i.id}>
                  <Checkbox checked={i.done} disabled aria-label={i.text} /> {i.text}
                </li>
              ))}
            {state.links
              .filter((l) => l.kind === 'precedes' && l.toId === card.id)
              .map((l) => (
                <li key={l.id}>{t('Depende de #{number}', { number: state.cards.find((c) => c.id === l.fromId)?.number ?? '?' })}</li>
              ))}
          </ul>
        </section>
      )}
      {editing && (
        <ActivityContextEditor
          key={contextTargetKey(editing)}
          initial={draftOf(editing)}
          drafts={allDrafts}
          title={t('Configurar {activity}', { activity: name(editing) })}
          onApply={modify}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** Padrões do board/workflow usam o mesmo editor e resolvedor das seleções dos cards. */
export function ContextPlanDefaults() {
  const state = useBoardStore((s) => s.state)!;
  const [scope, setScope] = useState('board');
  const [drafts, setDrafts] = useState<ExecutionPlanDrafts>({});
  return (
    <section className="context-plan-defaults">
      <h3>{t('Padrões do plano de execução')}</h3>
      <Select.Root value={scope} onValueChange={setScope}>
        <Select.Trigger aria-label={t('Escopo do plano')} />
        <Select.Content>
          <Select.Item value="board">{t('Padrão do board')}</Select.Item>
          {state.workflows.map((w) => (
            <Select.Item key={w.id} value={w.id}>
              {w.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <ExecutionPlanPanel workflowId={scope === 'board' ? null : scope} drafts={drafts} onDrafts={setDrafts} />
    </section>
  );
}
