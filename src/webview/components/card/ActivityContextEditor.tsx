import { useState } from 'react';
import { Button, Checkbox, Dialog, Select, TextArea } from '@radix-ui/themes';
import type { ActivityContextWrite, ActivityContextSelection } from '../../../shared/contextPlanning';
import { planPreview, withContextDrafts, contextTargetKey } from '../../../shared/contextPlan';
import { useBoardStore } from '../../store/boardStore';
import { t } from '../../i18n';
import { FormField } from '../ui';
import { ModelEditor } from '../FieldRenderer';
import { ContextDraftPreview } from './ContextDraftPreview';

/** Edita uma atividade em memória; salvar o board exige a revisão do lote no painel pai. */
export function ActivityContextEditor({
  initial,
  drafts,
  title,
  onApply,
  onClose,
}: {
  initial: ActivityContextWrite;
  drafts: ActivityContextWrite[];
  title: string;
  onApply(value: ActivityContextWrite): void;
  onClose(): void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [returnFocus] = useState(() => document.activeElement);
  const selection = draft.selection;
  const change = (patch: Partial<ActivityContextSelection>) => setDraft({ ...draft, selection: { ...selection, ...patch } });
  const allDrafts = [...drafts.filter((d) => contextTargetKey(d.target) !== contextTargetKey(draft.target)), draft];
  const previewState = withContextDrafts(state, allDrafts);
  const preview = planPreview(state, draft.target, allDrafts);
  const artifacts = state.harness.library?.artifacts ?? [];
  const contract = previewState.contextPlanning?.agents.find((a) => a.artifactId === preview.agent?.artifactId)?.contract;
  const agentValue =
    selection.agent.mode === 'inherit' ? 'inherit' : selection.agent.value === null ? 'empty' : `id:${selection.agent.value}`;
  const agents = artifacts.filter((a) => a.kind === 'agent');
  const selectedAgentId = selection.agent.mode === 'explicit' ? selection.agent.value : null;
  const missingAgent = selectedAgentId && !agents.some((a) => a.id === selectedAgentId);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        className="board-dialog-lg scope-harness board-library"
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
        }}
      >
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>
          {t('Revise a configuração desta atividade. Alterações ficam no rascunho até aplicar o plano.')}
        </Dialog.Description>
        <div className="context-contract-fields">
          <FormField label={t('Agente da atividade')}>
            {(id) => (
              <Select.Root
                value={agentValue}
                onValueChange={(value) =>
                  change({
                    agent:
                      value === 'inherit' ? { mode: 'inherit' } : { mode: 'explicit', value: value === 'empty' ? null : value.slice(3) },
                  })
                }
              >
                <Select.Trigger id={id} />
                <Select.Content>
                  <Select.Item value="inherit">{t('Herdar')}</Select.Item>
                  <Select.Item value="empty">{t('Nenhum agente')}</Select.Item>
                  {missingAgent && (
                    <Select.Item value={`id:${selection.agent.mode === 'explicit' ? selection.agent.value : ''}`}>
                      {t('Agente ausente')}
                    </Select.Item>
                  )}
                  {agents.map((a) => (
                    <Select.Item key={a.id} value={`id:${a.id}`}>
                      {a.name}
                      {a.description ? ` · ${a.description.slice(0, 160)}` : ''}
                      {a.usage === 'off' || a.missing ? ` · ${t('Indisponível')}` : ''}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          </FormField>
          <label className="tool-option">
            <Checkbox
              checked={selection.model.mode === 'inherit'}
              onCheckedChange={(checked) => change({ model: checked ? { mode: 'inherit' } : { mode: 'explicit', value: '' } })}
            />
            <span>{t('Herdar modelo')}</span>
          </label>
          {selection.model.mode === 'explicit' && (
            <ModelEditor
              value={selection.model.value}
              onChange={(value) => change({ model: { mode: 'explicit', value: typeof value === 'string' ? value : '' } })}
            />
          )}
          <p className="muted small">
            {t('Modelo e fallback serão avaliados pelo mecanismo de políticas existente. Esta tela não decide alternativas.')}
          </p>
          {(['additionalSkillIds', 'activeMcpIds'] as const).map((field) => {
            const choice = selection[field];
            const skill = field === 'additionalSkillIds';
            const kind = skill ? 'skill' : 'mcp';
            const selected = choice.mode === 'explicit' ? choice.value : [];
            const entries = artifacts.filter(
              (a) =>
                a.kind === kind &&
                (a.usage !== 'always' || selected.includes(a.id)) &&
                (!skill || !contract?.essentialSkillIds.includes(a.id) || selected.includes(a.id)),
            );
            const ids = [...new Set([...entries.map((a) => a.id), ...selected])];
            return (
              <section key={field} aria-label={skill ? t('Skills adicionais') : t('MCPs ativos')}>
                <h3>{skill ? t('Skills adicionais') : t('MCPs ativos')}</h3>
                <label className="tool-option">
                  <Checkbox
                    checked={choice.mode === 'inherit'}
                    onCheckedChange={(checked) => change({ [field]: checked ? { mode: 'inherit' } : { mode: 'explicit', value: [] } })}
                  />
                  <span>{skill ? t('Herdar skills adicionais') : t('Herdar MCPs ativos')}</span>
                </label>
                <p className="muted small">
                  {skill
                    ? t('Essenciais e Sempre aparecem na prévia. Sugestões não entram até serem selecionadas.')
                    : t(
                        'Selecionar ativa somente os MCPs permitidos pelo agente. Escolhas incompatíveis permanecem visíveis para remoção.',
                      )}
                </p>
                {choice.mode === 'explicit' &&
                  ids.map((id) => {
                    const a = artifacts.find((a) => a.id === id);
                    const unavailable = !a || a.kind !== kind || a.missing || a.usage === 'off';
                    const outside = !skill && !contract?.allowedMcpIds.includes(id);
                    return (
                      <label className="tool-option" key={id}>
                        <Checkbox
                          checked={selected.includes(id)}
                          disabled={!selected.includes(id) && (unavailable || outside)}
                          onCheckedChange={(checked) =>
                            change({ [field]: { mode: 'explicit', value: checked ? [...selected, id] : selected.filter((v) => v !== id) } })
                          }
                        />
                        <span>
                          {a?.name ?? id}
                          {unavailable
                            ? ` · ${t('Indisponível')}`
                            : outside
                              ? ` · ${t('Fora do contrato do agente')}`
                              : skill && contract?.availableSkillIds.includes(id)
                                ? ` · ${t('Sugestão')}`
                                : ''}
                        </span>
                      </label>
                    );
                  })}
              </section>
            );
          })}
          <section aria-label={t('Entradas da atividade')}>
            <h3>{t('Entradas da atividade')}</h3>
            {[...new Set([...state.attachments.map((a) => a.id), ...selection.inputAttachmentIds])].map((id) => {
              const a = state.attachments.find((a) => a.id === id);
              const card = state.cards.find((c) => c.id === a?.cardId);
              return (
                <label className="tool-option" key={id}>
                  <Checkbox
                    checked={selection.inputAttachmentIds.includes(id)}
                    disabled={!a && !selection.inputAttachmentIds.includes(id)}
                    onCheckedChange={(checked) =>
                      change({
                        inputAttachmentIds: checked
                          ? [...selection.inputAttachmentIds, id]
                          : selection.inputAttachmentIds.filter((v) => v !== id),
                      })
                    }
                  />
                  <span>{a ? `#${card?.number ?? '?'} · ${a.filename}` : `${id} · ${t('Indisponível')}`}</span>
                </label>
              );
            })}
          </section>
          <FormField label={t('Resultado esperado')}>
            {(id) => (
              <TextArea
                id={id}
                rows={3}
                value={selection.expectedResult}
                maxLength={16000}
                onChange={(e) => change({ expectedResult: e.target.value })}
              />
            )}
          </FormField>
          <FormField label={t('Justificativa da escolha')}>
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.reason ?? ''}
                maxLength={4000}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            )}
          </FormField>
        </div>
        <ContextDraftPreview preview={preview} />
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t('Usar no rascunho do plano')}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
