import { Button, TextField } from '@radix-ui/themes';
import type { Agent } from '../../../../shared/harness';
import { isFreeName, type AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { harness } from '../../../commands';
import { DeleteButton, FormField, IconPlus } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { SettingsCard } from '../SettingsCard';
import { DraftForm } from './DraftForm';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** Os subagentes do projeto, quando a ferramenta em uso os define em arquivos. */
export function ProjectAgents({ tool, edit }: { tool: AiToolInfo; edit: ProjectEditing }) {
  const agents = useBoardStore((s) => s.state!.harness.agents);
  const { draft } = edit;
  const createAgent = () => {
    harness.createAgent({
      name: draft.name,
      description: draft.description.trim(),
      content: draft.body,
      model: draft.model.trim() || undefined,
    });
    edit.clearForm();
  };

  const agentRow = (a: Agent) => (
    <SettingsCard
      key={a.name}
      title={a.name}
      badge={a.model ? { text: a.model } : undefined}
      actions={
        <>
          <Button variant="soft" color="gray" onClick={() => edit.toggle('agent', a.name)}>
            {edit.isEditing('agent', a.name) ? t('Fechar edição') : t('Editar')}
          </Button>
          <DeleteButton
            title={t('Apagar o subagente')}
            question={t('Apagar o subagente "{name}"?', { name: a.name })}
            message={t('O arquivo do subagente é removido do projeto.')}
            onConfirm={() => harness.deleteAgent(a.name)}
          />
        </>
      }
    >
      <div className="muted small">{a.description || t('Sem descrição no frontmatter.')}</div>
      <div className="muted small">
        <code>{a.path}</code>
      </div>
      {edit.isEditing('agent', a.name) && (
        <FileEditor saved={a.content} onSave={(content) => harness.writeAgent(a.name, content)} onClose={edit.close} />
      )}
    </SettingsCard>
  );

  return (
    <>
      <SectionHeader
        title={t('Subagentes')}
        actions={
          <Button onClick={() => edit.toggleNew('newAgent')}>
            <IconPlus /> {t('Novo subagente')}
          </Button>
        }
      >
        {rich(
          'Subagentes do {tool}: cada arquivo em <code>{dir}</code> define um ajudante com instruções próprias, e a ferramenta delega trabalho a ele pela descrição.',
          { tool: tool.label, dir: tool.agents.dir },
        )}{' '}
        {t('Um subagente pode fixar o modelo que usa, o que serve para executar um card com o modelo indicado nele.')}
      </SectionHeader>
      {edit.editing?.kind === 'newAgent' && (
        <DraftForm
          title={t('Subagente novo')}
          draft={draft}
          onChange={edit.patchDraft}
          nameOk={isFreeName(draft.name, agents)}
          namePlaceholder="revisor-de-spec"
          descriptionLabel={t('Descrição (quando delegar)')}
          descriptionPlaceholder={t('Revisa uma Spec e aponta lacunas antes do Plan')}
          bodyPlaceholder={t('Instruções do subagente')}
          submitLabel={t('Criar subagente')}
          onSubmit={createAgent}
          onCancel={edit.clearForm}
        >
          <FormField label={t('Modelo (opcional)')}>
            {(id) => (
              <TextField.Root
                id={id}
                value={draft.model}
                onChange={(e) => edit.patchDraft({ model: e.target.value })}
                placeholder={t('vazio = o modelo da sessão')}
              />
            )}
          </FormField>
        </DraftForm>
      )}
      {agents.map(agentRow)}
      {agents.length === 0 && <p className="muted">{rich('Nenhum subagente em <code>{dir}</code> ainda.', { dir: tool.agents.dir })}</p>}
    </>
  );
}
