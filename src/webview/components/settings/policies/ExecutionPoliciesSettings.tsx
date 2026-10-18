import { useRef, useState } from 'react';
import { Button, Dialog } from '@radix-ui/themes';
import type { ExecutionPolicy, ExecutionPolicyRecord } from '../../../../shared/executionPolicies';
import type { PolicyLibrary } from '../../../../shared/policyManagement';
import { requestExecutionPolicy } from '../../../request';
import { executionPolicies } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';
import { SectionHeader } from '../SectionHeader';
import { SettingsCard } from '../SettingsCard';
import { PolicyEditor } from './PolicyEditor';
import { PolicySummary } from './parts';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function ExecutionPoliciesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [library, setLibrary] = useState<PolicyLibrary | null>(null);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ base: ExecutionPolicyRecord | null; initial: ExecutionPolicy } | null>(null);
  const [history, setHistory] = useState<{ id: string; records: ExecutionPolicyRecord[]; next: number | null } | null>(null);
  const focus = useRef<HTMLElement | null>(null);
  const reload = async () => {
    const reply = await requestExecutionPolicy({ type: 'executionPolicy.read' });
    if (!reply.library) throw new Error(t('O host não devolveu as políticas.'));
    setLibrary(reply.library);
    return reply.library;
  };
  const load = useAction(async () => {
    await reload();
    setOpen(true);
  });
  const remove = useAction(async (row: ExecutionPolicyRecord) => {
    await executionPolicies.remove(row.policy.id, row.revision);
    await reload();
  });
  const readHistory = useAction(async (id: string, beforeRevision?: number) => {
    const reply = await requestExecutionPolicy({ type: 'executionPolicy.read', id, beforeRevision });
    setHistory((old) => ({
      id,
      records: beforeRevision && old?.id === id ? [...old.records, ...(reply.history ?? [])] : (reply.history ?? []),
      next: reply.nextBefore ?? null,
    }));
  });
  const newPolicy = () => {
    const tool = state.board.aiTool,
      model = library!.models.find((m) => m.tool === tool);
    const initial: ExecutionPolicy = {
      version: 1,
      id: newId(),
      name: '',
      enabled: false,
      priority: Math.min(1000000, Math.max(0, ...library!.snapshot.records.map((r) => r.policy.priority)) + 10),
      conditions: {
        profileIds: [tool],
        models: model ? [model.model] : [null],
        actions: [],
        agentIds: [],
        phaseIds: [],
        cardTypeIds: [],
        origins: [],
        failures: ['quota'],
        explicit: 'exclude',
      },
      action: 'block',
      targets: [],
      limits: { maxAttempts: 2, maxElapsedMs: 3600000, backoffMs: 30000, globalProcesses: null, perProfile: {} },
    };
    setEditor({ base: null, initial });
  };
  return (
    <section>
      <SectionHeader id="execution-policies" title={t('Políticas de execução e fallback')}>
        <p>
          {t(
            'Prepare políticas versionadas e compare cenários sem iniciar IA. A execução atual ainda usa o modelo reserva das regras; estas políticas preparam o novo plano.',
          )}
        </p>
      </SectionHeader>
      <Button
        disabled={load.busy}
        onClick={(e) => {
          focus.current = e.currentTarget;
          void load.run();
        }}
      >
        {load.busy ? t('Lendo políticas…') : t('Gerenciar políticas')}
      </Button>
      {load.error && <p role="alert">{t(load.error)}</p>}
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            setOpen(false);
            setEditor(null);
            setHistory(null);
          }
        }}
      >
        <Dialog.Content
          maxWidth="1050px"
          className="scope-harness board-library"
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            focus.current?.focus();
          }}
        >
          <Dialog.Title>
            {t(editor ? 'Editar política' : history ? 'Histórico da política' : 'Políticas de execução e fallback')}
          </Dialog.Title>
          <Dialog.Description>
            {t('Salvar exige comparação e revisão explícita. Simulações não concedem acesso nem iniciam execuções.')}
          </Dialog.Description>
          {library &&
            (editor ? (
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
            ) : history ? (
              <>
                <p>{t('Versões anteriores não substituem a política atual. Use como rascunho para revisar novamente.')}</p>
                {history.records.map((row) => (
                  <SettingsCard
                    key={row.revision}
                    title={t('Versão {version}', { version: row.revision })}
                    hint={new Date(row.updatedAt).toLocaleString()}
                    actions={
                      <Button
                        variant="soft"
                        onClick={() => {
                          const base = library.snapshot.records.find((r) => r.policy.id === history.id) ?? null;
                          if (base) {
                            setEditor({ base, initial: structuredClone(row.policy) });
                            setHistory(null);
                          }
                        }}
                      >
                        {t('Usar versão como rascunho')}
                      </Button>
                    }
                  >
                    <PolicySummary policy={row.policy} library={library} />
                  </SettingsCard>
                ))}
                {history.next !== null && (
                  <Button disabled={readHistory.busy} onClick={() => void readHistory.run(history.id, history.next!)}>
                    {readHistory.busy ? t('Lendo histórico…') : t('Carregar versões anteriores')}
                  </Button>
                )}
                <Button variant="soft" disabled={readHistory.busy} onClick={() => setHistory(null)}>
                  {t('Voltar à lista')}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={newPolicy}>{t('Nova política')}</Button>
                {!library.snapshot.records.length && <p>{t('Nenhuma política cadastrada.')}</p>}
                {[...library.snapshot.records]
                  .sort((a, b) => a.policy.priority - b.policy.priority)
                  .map((row) => (
                    <SettingsCard
                      key={row.policy.id}
                      title={row.policy.name}
                      badge={{
                        text: t(row.review === 'pending' ? 'Pendente de revisão' : row.policy.enabled ? 'Ligada' : 'Desligada'),
                        on: row.review === 'reviewed' && row.policy.enabled,
                      }}
                      hint={t('Prioridade {number} · versão {version}', { number: row.policy.priority, version: row.revision })}
                      actions={
                        <>
                          <Button
                            variant="soft"
                            disabled={remove.busy || readHistory.busy}
                            onClick={() => setEditor({ base: row, initial: structuredClone(row.policy) })}
                          >
                            {t('Editar')}
                          </Button>
                          <Button
                            variant="soft"
                            disabled={remove.busy}
                            onClick={() =>
                              setEditor({
                                base: null,
                                initial: {
                                  ...structuredClone(row.policy),
                                  id: newId(),
                                  name: `${row.policy.name} (${t('cópia')})`,
                                  enabled: false,
                                },
                              })
                            }
                          >
                            {t('Duplicar')}
                          </Button>
                          <Button variant="soft" disabled={readHistory.busy} onClick={() => void readHistory.run(row.policy.id)}>
                            {readHistory.busy ? t('Lendo histórico…') : t('Histórico')}
                          </Button>
                          <Button
                            color="red"
                            variant="soft"
                            disabled={remove.busy}
                            onClick={() =>
                              useBoardStore.getState().ask({
                                title: t('Remover política "{name}"?', { name: row.policy.name }),
                                message: t('A política deixa a lista. O histórico e os snapshots anteriores são preservados.'),
                                confirmLabel: t('Remover política'),
                                onConfirm: async () => {
                                  await remove.run(row);
                                },
                              })
                            }
                          >
                            {remove.busy ? t('Removendo…') : t('Remover')}
                          </Button>
                        </>
                      }
                    />
                  ))}
              </>
            ))}
          {(remove.error || readHistory.error) && <p role="alert">{t(remove.error ?? readHistory.error!)}</p>}
          {!editor && (
            <Dialog.Close>
              <Button variant="soft">{t('Fechar')}</Button>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </section>
  );
}
