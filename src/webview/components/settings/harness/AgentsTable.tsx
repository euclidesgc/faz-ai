import { useState } from 'react';
import { Badge, Card, Checkbox, Text, TextArea, TextField } from '@radix-ui/themes';
import { AGENT_SUGGESTIONS, type AgentSuggestion } from '../../../../shared/agentSuggestions';
import type { Agent, InstallScope } from '../../../../shared/harness';
import { isFreeName, toItemName, type AiToolInfo } from '../../../../shared/harnessProject';
import { usageOf } from '../../../../shared/harnessSelection';
import { matchesQuery } from '../../../../shared/harnessTopics';
import { ai, harness, settings } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ModelEditor } from '../../FieldRenderer';
import { ActionButton, DeleteButton, FormField, IconAgents, IconPlus } from '../../ui';
import { AgentEditor } from './AgentEditor';
import { AgentWizard } from './AgentWizard';
import { AgentsToolbar, DefaultAgentBadge, DeleteAgentButton, MakeDefaultButton } from './AgentsToolbar';
import { FormActions } from './FormActions';
import { withGlobalWarning } from './text';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

const EMPTY = { name: '', description: '', body: '', model: '' };

/**
 * Os agentes de um escopo: arquivos de agente da ferramenta, com a marcação "disponível no board" em cada
 * um, o padrão, e as ações de criar (à mão, pela IA ou os de fábrica), editar e apagar.
 */
export function AgentsTable({ tool, scope, query = '' }: { tool: AiToolInfo; scope: InstallScope; query?: string }) {
  const state = useBoardStore((s) => s.state)!;
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // o assistente de criação, aberto limpo ou com uma sugestão pronta
  const [wizard, setWizard] = useState<{ preset?: AgentSuggestion; at: number } | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const agents = state.harness.agents.filter((a) => a.scope === scope && matchesQuery(query, a.name, a.description));
  const available = (a: Agent) => usageOf(state.harnessSelection, { kind: 'agent', location: a.location }) !== null;
  const nameOk = isFreeName(draft.name, state.harness.agents);
  const create = () => {
    harness.createAgent({
      name: draft.name,
      description: draft.description.trim(),
      body: draft.body,
      model: draft.model,
      tools: [],
      deniedTools: [],
      skills: [],
      mcp: [],
    });
    setDraft(EMPTY);
    setCreating(false);
  };

  if (!tool.agents)
    return (
      <p className="muted">
        {t('O {tool} não define agentes em arquivos; o board executa os cards com o agente embutido.', { tool: tool.label })}
      </p>
    );

  return (
    <div id="harness-agents" className="agents-table">
      <p className="muted small">
        {rich(
          'Um agente é um arquivo de agente do {tool} em <code>{dir}</code>: as instruções são o papel da sessão, e o frontmatter diz o modelo, as ferramentas, as skills e os servidores MCP que ela recebe. <b>Disponível no board</b> é o que os cards e as fases podem escolher; o <b>padrão</b> executa quando nenhum deles escolhe.',
          {
            tool: tool.label,
            dir: scope === 'project' ? tool.agents.dir : `~/${tool.agents.dir}`,
          },
        )}
      </p>
      <Text as="p" size="1" color="gray">
        {t('Mostrando os agentes do {tool}', { tool: tool.label })}
        {' · '}
        <ActionButton
          variant="ghost"
          size="1"
          aria-label={t('Trocar a ferramenta de IA, em Harness')}
          hint={t('Vai a "Ferramenta deste projeto", na aba Ferramenta e execução.')}
          onClick={() => useBoardStore.getState().goToSection('harness-tool')}
        >
          {t('trocar ferramenta')}
        </ActionButton>
      </Text>
      <AgentsToolbar
        onNew={() => {
          setCreating(!creating);
          setWizard(null);
        }}
        onWizard={(preset) => {
          setWizard({ preset, at: Date.now() });
          setCreating(false);
        }}
      />
      {wizard && <AgentWizard key={wizard.at} tool={tool} preset={wizard.preset} onClose={() => setWizard(null)} />}
      {creating && (
        <Card className="draft-card" aria-label={t('Agente novo')}>
          <FormField label={t('Nome')} hint={draft.name && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
            {(id) => (
              <TextField.Root
                id={id}
                autoFocus
                color={draft.name && !nameOk ? 'red' : undefined}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: toItemName(e.target.value) })}
                placeholder="revisor-de-spec"
              />
            )}
          </FormField>
          <FormField label={t('Descrição (quando usar)')}>
            {(id) => (
              <TextField.Root
                id={id}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder={t('Revisa uma Spec e aponta lacunas antes do Plan')}
              />
            )}
          </FormField>
          <FormField label={t('Modelo e esforço')} hint={t('O modelo indicado no card tem preferência.')}>
            {() => (
              <ModelEditor value={draft.model || null} onChange={(v) => setDraft({ ...draft, model: typeof v === 'string' ? v : '' })} />
            )}
          </FormField>
          <FormField label={t('Instruções')}>
            {(id) => (
              <TextArea
                id={id}
                className="code-area"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={10}
                placeholder={t('Como este agente trabalha: padrões, comandos, o que nunca fazer')}
                spellCheck={false}
              />
            )}
          </FormField>
          <FormActions
            label={t('Criar agente')}
            disabled={!nameOk || !draft.description.trim()}
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}
      <table className="table">
        <thead>
          <tr>
            <th className="narrow" title={t('Os cards e as fases podem escolher este agente; o padrão precisa estar disponível')}>
              {t('Disponível no board')}
            </th>
            <th>{t('Nome')}</th>
            <th>{t('Descrição')}</th>
            <th>{t('Modelo')}</th>
            <th>{t('Arquivo')}</th>
            <th className="narrow"></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const on = available(a);
            const open = editing === a.location;
            return [
              <tr key={a.location} className={on ? '' : 'off'}>
                <td className="narrow">
                  <Checkbox
                    aria-label={t('Disponível no board: {name}', { name: a.name })}
                    checked={on}
                    onCheckedChange={(v) =>
                      harness.setSelection([{ kind: 'agent', location: a.location }], v === true ? 'contextual' : null)
                    }
                  />
                </td>
                <td>
                  <span className="item-name">{a.name}</span>{' '}
                  <DefaultAgentBadge name={a.name} />{' '}
                  {a.seed && (
                    <Badge color="gray" variant="outline" title={t('Criado pelo board; pode ser editado ou apagado')}>
                      {t('de fábrica')}
                    </Badge>
                  )}
                </td>
                <td className="item-hint" title={a.description}>
                  {a.description}
                </td>
                <td className="muted small">{a.modelValue || a.model || '—'}</td>
                <td>
                  <button
                    type="button"
                    className="path-link"
                    title={t('Abre o arquivo no board, para ler e editar')}
                    onClick={() => useBoardStore.getState().openHarnessFile(a.path)}
                  >
                    {a.location}
                  </button>
                </td>
                <td className="narrow">
                  <div className="row-actions">
                    {on && <MakeDefaultButton name={a.name} />}
                    <ActionButton
                      variant="ghost"
                      size="1"
                      hint={open ? t('Fecha o editor; o que não foi salvo se perde.') : t('Abre o editor do agente logo abaixo da linha.')}
                      onClick={() => setEditing(open ? null : a.location)}
                    >
                      {open ? t('Fechar edição') : t('Editar')}
                    </ActionButton>
                    <DeleteAgentButton name={a.name} location={a.location} />
                  </div>
                </td>
              </tr>,
              open ? (
                <tr key={`${a.location}:edit`}>
                  <td colSpan={6}>
                    <AgentEditor agent={a} tool={tool} onClose={() => setEditing(null)} />
                  </td>
                </tr>
              ) : null,
            ];
          })}
          {agents.length === 0 && (
            <tr>
              <td colSpan={6} className="muted small">
                {query.trim() ? t('Nada encontrado para a busca.') : t('Nenhum agente do {tool} neste escopo.', { tool: tool.label })}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
