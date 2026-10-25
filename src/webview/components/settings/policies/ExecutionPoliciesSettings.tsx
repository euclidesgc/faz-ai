import { useEffect, useState } from 'react';
import { Badge, Button, IconButton, Switch } from '@radix-ui/themes';
import type { ExecutionPolicy, ExecutionPolicyRecord } from '../../../../shared/executionPolicies';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { requestExecutionPolicy } from '../../../request';
import { executionPolicies } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';
import { ActionButton, IconArrowDown, IconArrowUp, IconEdit, IconPlus, IconTrash } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { PolicyEditor } from './PolicyEditor';
import { HOW_LABELS, isAdvanced, offTargetNote, originLabel, targetName } from './parts';
import { PolicySimulation } from './PolicySimulation';
import { PolicyAssistant } from './PolicyAssistant';

const LEGACY_REASONS = {
  'model-missing': 'o modelo não está no catálogo',
  'fallback-missing': 'o modelo não está no catálogo',
  'effort-invalid': 'o esforço não existe no modelo',
  'id-invalid': 'o identificador da regra é inválido',
} as const;

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const byPriority = (records: ExecutionPolicyRecord[]) => [...records].sort((a, b) => a.policy.priority - b.policy.priority);

/**
 * Regras de fallback: a lista (ordem = prioridade, liga/desliga, editar, excluir) e o editor inline. As políticas
 * continuam versionadas e revisadas no host; a tela só fala em regras ("quando X esgotar a cota, usar Y").
 */
export function ExecutionPoliciesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [library, setLibrary] = useState<PolicyLibrary | null>(null);
  const [editor, setEditor] = useState<{ base: ExecutionPolicyRecord | null; initial: ExecutionPolicy } | null>(null);
  const reload = async () => {
    const reply = await requestExecutionPolicy({ type: 'executionPolicy.read' });
    if (!reply.library) throw new Error(t('O host não devolveu as regras.'));
    setLibrary(reply.library);
    return reply.library;
  };
  const load = useAction(async () => {
    await reload();
  });
  // a lista lê as regras ao abrir a tela e quando outra janela as muda
  useEffect(() => {
    void load.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.executionPolicyRevision]);
  const write = useAction(async (rows: { policy: ExecutionPolicy; revision: number }[]) => {
    for (const row of rows) await executionPolicies.save(row.policy, row.revision, true);
    await reload();
  });
  const remove = useAction(async (row: ExecutionPolicyRecord) => {
    await executionPolicies.remove(row.policy.id, row.revision);
    await reload();
  });
  const newRule = () => {
    const tool = state.board.aiTool;
    const model = library!.models.find((m) => m.tool === tool);
    const usable = (m: { tool: string }) => library!.profiles.some((p) => p.id === m.tool && !p.off);
    // o primeiro destino: um modelo de outro agente ligado; sem outro agente, outro modelo do mesmo
    const next =
      library!.models.find((m) => m.tool !== tool && usable(m)) ?? library!.models.find((m) => m.tool === tool && m !== model && usable(m));
    const initial: ExecutionPolicy = {
      version: 1,
      id: newId(),
      name: '',
      enabled: true,
      priority: Math.min(1000000, Math.max(0, ...library!.snapshot.records.map((r) => r.policy.priority)) + 10),
      conditions: {
        profileIds: [tool],
        models: model ? [model.model] : [],
        actions: [],
        agentIds: [],
        phaseIds: [],
        cardTypeIds: [],
        origins: [],
        failures: ['quota'],
        explicit: 'include',
      },
      action: 'auto',
      targets: next ? [{ profileId: next.tool, model: next.model, effort: next.defaultEffort }] : [],
      limits: { maxAttempts: 2, maxElapsedMs: 3600000, backoffMs: 30000, globalProcesses: null, perProfile: {} },
    };
    setEditor({ base: null, initial });
  };
  const rows = library ? byPriority(library.snapshot.records) : [];
  const move = (index: number, delta: number) => {
    const order = [...rows];
    [order[index], order[index + delta]] = [order[index + delta]!, order[index]!];
    // a ordem da lista é a prioridade. Renumera em duas passadas (primeiro numa faixa alta, depois 0, 10, 20…):
    // uma só passada daria a uma regra, por um instante, a prioridade de outra, e o host recusa duas regras
    // ligadas empatadas (`ambiguous-priority`).
    const revision = new Map(order.map((r) => [r.policy.id, r.revision]));
    const writes: { policy: ExecutionPolicy; revision: number }[] = [];
    for (const base of [500000, 0])
      order.forEach((r, i) => {
        writes.push({ policy: { ...r.policy, priority: base + i * 10 }, revision: revision.get(r.policy.id)! });
        revision.set(r.policy.id, revision.get(r.policy.id)! + 1);
      });
    void write.run(writes);
  };
  const busy = write.busy || remove.busy;
  const error = load.error ?? write.error ?? remove.error;
  return (
    <section>
      <SectionHeader
        id="execution-policies"
        title={t('Regras de fallback')}
        actions={
          <ActionButton
            disabled={!library || editor !== null || !library.models.length}
            disabledReason={!library?.models.length ? t('Conecte um agente com modelos antes.') : t('Termine a regra que está aberta.')}
            hint={t('Abre o formulário de uma regra nova.')}
            onClick={newRule}
          >
            <IconPlus /> {t('Montar nova regra')}
          </ActionButton>
        }
      >
        {t(
          'Quando um modelo esgota o limite de uso, o board segue o card em outro modelo, de qualquer agente ligado. Sem regra, o card espera a cota renovar.',
        )}
      </SectionHeader>

      {library && editor && (
        <PolicyEditor
          key={editor.initial.id}
          initial={editor.initial}
          base={editor.base}
          library={library}
          onReload={reload}
          onSaved={async () => {
            await reload();
            setEditor(null);
          }}
          onCancel={() => setEditor(null)}
        />
      )}

      {!library && !load.error && <p className="muted">{t('Lendo regras…')}</p>}
      {error && (
        <p role="alert">
          {t(error)}{' '}
          <Button variant="soft" size="1" disabled={load.busy} onClick={() => void load.run()}>
            {t('Recarregar')}
          </Button>
        </p>
      )}
      {library && (
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t('Regra')}</th>
              <th>{t('Quando')}</th>
              <th>{t('Usa no lugar')}</th>
              <th>{t('Como')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const p = row.policy;
              const pending = row.review === 'pending';
              const on = !pending && p.enabled;
              const offTargets = p.targets.filter((target) => offTargetNote(library, target.profileId));
              return (
                <tr key={p.id} className={on ? '' : 'off'}>
                  <td className="narrow">
                    <Switch
                      size="1"
                      checked={on}
                      disabled={pending || busy}
                      title={pending ? t('Precisa da sua revisão') : on ? t('Regra em uso') : t('Regra desligada')}
                      aria-label={t('Regra {name} em uso', { name: p.name })}
                      onCheckedChange={(enabled) => void write.run([{ policy: { ...p, enabled }, revision: row.revision }])}
                    />
                  </td>
                  <td>
                    {p.name}
                    {pending && (
                      <>
                        {' '}
                        <Badge color="amber" variant="soft">
                          {t('Precisa da sua revisão')}
                        </Badge>
                      </>
                    )}
                  </td>
                  <td>
                    {originLabel(library, p.conditions)}{' '}
                    {p.conditions.failures.length === 1 && p.conditions.failures[0] === 'quota' ? t('esgota a cota') : t('falha')}
                    {isAdvanced(p) && <span className="muted"> {t('+ condições')}</span>}
                  </td>
                  <td>
                    {p.targets.map((target) => targetName(library, target)).join(t(', depois ')) || <span className="muted">—</span>}
                    {offTargets.length > 0 && (
                      <span className="muted" title={offTargets.map((target) => offTargetNote(library, target.profileId)).join(' ')}>
                        {' '}
                        ({t('agente desligado')})
                      </span>
                    )}
                  </td>
                  <td>{t(HOW_LABELS[p.action])}</td>
                  <td className="narrow">
                    <div className="row-actions">
                      <IconButton
                        variant="ghost"
                        color="gray"
                        title={t('Subir (vence as de baixo)')}
                        aria-label={t('Subir')}
                        disabled={i === 0 || busy}
                        onClick={() => move(i, -1)}
                      >
                        <IconArrowUp />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        color="gray"
                        title={t('Descer')}
                        aria-label={t('Descer')}
                        disabled={i === rows.length - 1 || busy}
                        onClick={() => move(i, 1)}
                      >
                        <IconArrowDown />
                      </IconButton>
                      {pending ? (
                        <Button
                          size="1"
                          variant="soft"
                          disabled={busy || editor !== null}
                          onClick={() => setEditor({ base: row, initial: structuredClone(p) })}
                        >
                          {t('Revisar e ligar')}
                        </Button>
                      ) : (
                        <IconButton
                          variant="ghost"
                          color="gray"
                          title={t('Editar')}
                          aria-label={t('Editar')}
                          disabled={busy || editor !== null}
                          onClick={() => setEditor({ base: row, initial: structuredClone(p) })}
                        >
                          <IconEdit />
                        </IconButton>
                      )}
                      <IconButton
                        variant="ghost"
                        color="red"
                        title={t('Remover da lista')}
                        aria-label={t('Remover')}
                        disabled={busy}
                        onClick={() =>
                          useBoardStore.getState().ask({
                            title: t('Remover a regra "{name}"?', { name: p.name }),
                            message: t('A regra deixa a lista. As versões anteriores ficam guardadas.'),
                            confirmLabel: t('Remover regra'),
                            onConfirm: async () => {
                              await remove.run(row);
                            },
                          })
                        }
                      >
                        <IconTrash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {t('Nenhuma regra: ao esgotar a cota, o card espera a renovação.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {library && (
        <details className="fallback-extras">
          <summary>{t('Testar as regras, pedir sugestão à IA e reservas antigas')}</summary>
          <div className="fallback-advanced-body">
            <PolicySimulation policy={null} library={library} />
            <section>
              <h4>{t('Pedir sugestão à IA')}</h4>
              <PolicyAssistant
                modes={['create', 'conflicts']}
                draft={null}
                library={library}
                applyLabel={t('Abrir proposta no editor')}
                onApply={(initial) => setEditor({ base: null, initial })}
              />
            </section>
            {library.legacy && (
              <div role="note">
                <h4>{t('Reservas de regras antigas')}</h4>
                <p className="muted small">
                  {t(
                    'Cada reserva de regra antiga virou uma regra desligada e pendente de revisão. Nada troca de agente até você revisar e ligar a regra; as condições da regra de sugestão (campos e tipo do card) não foram copiadas.',
                  )}
                </p>
                <ul>
                  {library.legacy.map((note) => {
                    const name = note.ruleName || note.ruleId;
                    return (
                      <li key={note.ruleId}>
                        {note.status === 'proposed'
                          ? t('Regra "{name}": proposta {state}', {
                              name,
                              state: t(note.review === 'reviewed' ? 'já revisada' : 'pendente de revisão'),
                            })
                          : t('Regra "{name}": sem conversão ({reason})', { name, reason: t(LEGACY_REASONS[note.reason!]) })}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
