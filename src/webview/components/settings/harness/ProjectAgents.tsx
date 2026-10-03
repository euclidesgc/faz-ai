import type { Agent } from '../../../../shared/harness';
import { isFreeName, type AiToolInfo } from '../../../../shared/harnessProject';
import { useBoardStore } from '../../../store/boardStore';
import { harness } from '../../../commands';
import { Button, DeleteButton, FieldRow } from '../../ui';
import { DraftForm } from './DraftForm';
import { FileEditor } from './FileEditor';
import type { ProjectEditing } from './useProjectEditing';

/** Os agentes (subagentes) do projeto, quando a ferramenta em uso os define em arquivos. */
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
    <section key={a.name} className="settings-block">
      <div className="row">
        <h3 className="plain">{a.name}</h3>
        {a.model && <span className="pill">{a.model}</span>}
        <span className="spacer" />
        <Button onClick={() => edit.toggle('agent', a.name)}>{edit.isEditing('agent', a.name) ? 'Fechar' : 'Editar'}</Button>
        <DeleteButton
          title="Apagar o agente"
          question={`Apagar o agente "${a.name}"?`}
          message="O arquivo do agente é removido do projeto."
          onConfirm={() => harness.deleteAgent(a.name)}
        />
      </div>
      <div className="muted small">{a.description || 'Sem descrição no frontmatter.'}</div>
      <div className="muted small">
        <code>{a.path}</code>
      </div>
      {edit.isEditing('agent', a.name) && (
        <FileEditor saved={a.content} onSave={(content) => harness.writeAgent(a.name, content)} onClose={edit.close} />
      )}
    </section>
  );

  return (
    <>
      <div className="row section-head">
        <h3>Agentes</h3>
        <span className="spacer" />
        {tool.agents && (
          <Button variant="primary" onClick={() => edit.toggleNew('newAgent')}>
            Novo agente
          </Button>
        )}
      </div>
      {tool.agents ? (
        <>
          <p className="muted small">
            Agentes (subagentes) do {tool.label}: cada arquivo em <code>{tool.agents.dir}</code> define um ajudante com instruções próprias,
            e a ferramenta delega trabalho a ele pela descrição.
            {tool.agents.modelField
              ? ' Um agente pode fixar o modelo que usa, o que serve para executar um card com o modelo indicado nele.'
              : ''}
          </p>
          {edit.editing?.kind === 'newAgent' && (
            <DraftForm
              draft={draft}
              onChange={edit.patchDraft}
              nameOk={isFreeName(draft.name, agents)}
              namePlaceholder="revisor-de-spec"
              descriptionLabel="Descrição (quando delegar)"
              descriptionPlaceholder="Revisa uma Spec e aponta lacunas antes do Plan"
              bodyPlaceholder="Instruções do agente"
              submitLabel="Criar agente"
              onSubmit={createAgent}
              onCancel={edit.clearForm}
            >
              {tool.agents.modelField && (
                <FieldRow label="Modelo (opcional)">
                  <input
                    value={draft.model}
                    onChange={(e) => edit.patchDraft({ model: e.target.value })}
                    placeholder="vazio = o modelo da sessão"
                  />
                </FieldRow>
              )}
            </DraftForm>
          )}
          <div className="stack">
            {agents.map(agentRow)}
            {agents.length === 0 && (
              <p className="muted">
                Nenhum agente em <code>{tool.agents.dir}</code> ainda.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="muted small">O {tool.label} não define agentes em arquivos do projeto.</p>
      )}
    </>
  );
}
