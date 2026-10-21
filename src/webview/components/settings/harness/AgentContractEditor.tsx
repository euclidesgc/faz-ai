import { useState } from 'react';
import { Button, Checkbox, Dialog, Select, TextArea, TextField } from '@radix-ui/themes';
import type { ToolCategory } from '../../../../shared/artifacts';
import type { AgentContextContract, ContextPlanningState } from '../../../../shared/contextPlanning';
import { resolveContextDraft } from '../../../../shared/contextDraftResolution';
import { contextPlanning } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { t } from '../../../i18n';
import { FormField } from '../../ui';
import { ContextDraftPreview } from '../../card/ContextDraftPreview';

const CATEGORIES: Record<ToolCategory, string> = { read: 'Leitura', edit: 'Edição', run: 'Comandos', net: 'Rede', agents: 'Subagentes' };
const EMPTY: AgentContextContract = {
  version: 1,
  role: '',
  instructions: '',
  essentialSkillIds: [],
  availableSkillIds: [],
  allowedMcpIds: [],
  tools: { categories: [], native: { tool: '', allow: [], deny: [] } },
};

/** O contrato tem revisão própria e nunca salva os campos legados do agente. */
export function AgentContractEditor({ artifactId, onClose }: { artifactId: string; onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [base] = useState(() => state.contextPlanning?.agents.find((r) => r.artifactId === artifactId));
  const [contract, setContract] = useState<AgentContextContract>(() => structuredClone(base?.contract ?? EMPTY));
  const [returnFocus] = useState(() => document.activeElement);
  const artifacts = state.harness.library?.artifacts ?? [];
  const agent = artifacts.find((a) => a.id === artifactId && a.kind === 'agent');
  const currentRevision = state.contextPlanning?.agents.find((r) => r.artifactId === artifactId)?.revision ?? 0;
  const stale = currentRevision !== (base?.revision ?? 0);
  const save = useAction(async () => {
    await contextPlanning.save({ kind: 'agent', artifactId, expectedRevision: base?.revision ?? 0, contract });
    onClose();
  });
  // Escopo da prévia: essenciais e Sempre, sem acrescentar as seleções de uma atividade real.
  const planning: ContextPlanningState = {
    runtime: 'legacy',
    legacy: state.contextPlanning?.legacy ?? { version: 0, agents: [], cards: [] },
    agents: [{ artifactId, revision: base?.revision ?? 0, updatedAt: base?.updatedAt ?? 0, contract }],
    activities: [
      {
        id: 'draft-preview',
        cardId: null,
        workflowId: null,
        phaseId: '',
        action: 'work',
        revision: 0,
        updatedAt: 0,
        selection: {
          version: 1,
          agent: { mode: 'explicit', value: artifactId },
          model: { mode: 'inherit' },
          additionalSkillIds: { mode: 'explicit', value: [] },
          activeMcpIds: { mode: 'explicit', value: [] },
          inputAttachmentIds: [],
          expectedResult: '',
        },
      },
    ],
  };
  const preview = resolveContextDraft(
    { ...state, contextPlanning: planning },
    { cardId: null, workflowId: null, phaseId: '', action: 'work' },
  );
  const toggle = (field: 'essentialSkillIds' | 'availableSkillIds' | 'allowedMcpIds', id: string) =>
    setContract({
      ...contract,
      [field]: contract[field].includes(id) ? contract[field].filter((v) => v !== id) : [...contract[field], id],
    });
  const dirty = JSON.stringify(contract) !== JSON.stringify(base?.contract ?? EMPTY);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !save.busy && onClose()}>
      <Dialog.Content
        maxWidth="900px"
        className="scope-harness board-library"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (save.busy) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
        }}
      >
        <Dialog.Title>{t('Contrato de contexto: {name}', { name: agent?.name ?? artifactId })}</Dialog.Title>
        <Dialog.Description>
          {t('Rascunho v1. Salvar não altera a execução legada. A admissão por capacidades ainda está indisponível (#729).')}
        </Dialog.Description>
        <fieldset disabled={save.busy} className="context-contract-fields">
          <FormField label={t('Papel do agente')}>
            {(id) => (
              <TextField.Root
                id={id}
                value={contract.role}
                maxLength={2000}
                onChange={(e) => setContract({ ...contract, role: e.target.value })}
              />
            )}
          </FormField>
          <FormField label={t('Instruções do contrato')}>
            {(id) => (
              <TextArea
                id={id}
                rows={8}
                value={contract.instructions}
                maxLength={524288}
                onChange={(e) => setContract({ ...contract, instructions: e.target.value })}
              />
            )}
          </FormField>
          {(
            [
              ['essentialSkillIds', 'Skills essenciais', 'Entram em toda atividade deste agente.'],
              ['availableSkillIds', 'Skills sugeridas', 'São sugestões para a atividade; não entram antecipadamente no contexto.'],
              ['allowedMcpIds', 'MCPs permitidos', 'Delimitam os MCPs que uma atividade pode selecionar; não ativam servidores por si só.'],
            ] as const
          ).map(([field, label, hint]) => {
            const kind = field === 'allowedMcpIds' ? 'mcp' : 'skill';
            const ids = [...new Set([...artifacts.filter((a) => a.kind === kind).map((a) => a.id), ...contract[field]])];
            return (
              <section key={field} aria-label={t(label)}>
                <h3>{t(label)}</h3>
                <p className="muted small">{t(hint)}</p>
                {ids.length === 0 && <p className="muted small">{t('Nenhum recurso deste tipo cadastrado.')}</p>}
                {ids.map((id) => {
                  const item = artifacts.find((a) => a.id === id);
                  return (
                    <label className="tool-option" key={id}>
                      <Checkbox checked={contract[field].includes(id)} onCheckedChange={() => toggle(field, id)} />
                      <span>
                        {item?.name ?? id}
                        {!item || item.missing || item.usage === 'off' || item.kind !== kind ? ` · ${t('Indisponível')}` : ''}
                      </span>
                    </label>
                  );
                })}
              </section>
            );
          })}
          <section aria-label={t('Restrições de ferramentas')}>
            <h3>{t('Restrições de ferramentas')}</h3>
            <p className="muted small">
              {t(
                'Categorias solicitadas no contrato. A tradução e a imposição dependem da admissão do executor. Lista vazia não concede todas as ferramentas.',
              )}
            </p>
            {Object.entries(CATEGORIES).map(([category, label]) => (
              <label className="tool-option" key={category}>
                <Checkbox
                  checked={contract.tools.categories.includes(category as ToolCategory)}
                  onCheckedChange={() =>
                    setContract({
                      ...contract,
                      tools: {
                        ...contract.tools,
                        categories: contract.tools.categories.includes(category as ToolCategory)
                          ? contract.tools.categories.filter((v) => v !== category)
                          : [...contract.tools.categories, category as ToolCategory],
                      },
                    })
                  }
                />
                <span>{t(label)}</span>
              </label>
            ))}
            <FormField label={t('Ferramenta das restrições nativas')}>
              {(id) => (
                <Select.Root
                  value={contract.tools.native.tool || 'none'}
                  onValueChange={(value) =>
                    setContract({
                      ...contract,
                      tools: {
                        ...contract.tools,
                        native: { ...contract.tools.native, tool: value === 'none' ? '' : (value as 'claude' | 'cursor' | 'kimi') },
                      },
                    })
                  }
                >
                  <Select.Trigger id={id} />
                  <Select.Content>
                    <Select.Item value="none">{t('Nenhuma')}</Select.Item>
                    {['claude', 'cursor', 'kimi'].map((tool) => (
                      <Select.Item key={tool} value={tool}>
                        {tool}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              )}
            </FormField>
            {(['allow', 'deny'] as const).map((field) => (
              <FormField key={field} label={field === 'allow' ? t('Permitir nativas (uma por linha)') : t('Negar nativas (uma por linha)')}>
                {(id) => (
                  <TextArea
                    id={id}
                    value={contract.tools.native[field].join('\n')}
                    onChange={(e) =>
                      setContract({
                        ...contract,
                        tools: {
                          ...contract.tools,
                          native: { ...contract.tools.native, [field]: e.target.value === '' ? [] : e.target.value.split('\n') },
                        },
                      })
                    }
                  />
                )}
              </FormField>
            ))}
          </section>
        </fieldset>
        <p className="muted small">
          {t('Prévia do contrato com essenciais e itens Sempre. Complementos da atividade não estão selecionados.')}
        </p>
        <ContextDraftPreview preview={preview} />
        {stale && <p role="alert">{t('O contrato mudou em outra edição. Feche e abra novamente para carregar a revisão atual.')}</p>}
        {save.error && <p role="alert">{t(save.error)}</p>}
        <div className="form-actions">
          <Button variant="ghost" disabled={save.busy} onClick={onClose}>
            {dirty ? t('Descartar') : t('Fechar')}
          </Button>
          <Button disabled={!agent || stale || save.busy || (!dirty && !!base)} onClick={() => void save.run()}>
            {t('Salvar rascunho do contrato')}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
