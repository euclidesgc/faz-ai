import { useState } from 'react';
import { Badge, Button, Card, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import type { Agent, InstallScope } from '../../../../shared/harness';
import { isFreeName, toItemName, type AiToolInfo } from '../../../../shared/harnessProject';
import { usageOf } from '../../../../shared/harnessSelection';
import { ai, harness, settings } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ModelEditor } from '../../FieldRenderer';
import { DeleteButton, FormField, IconPlus } from '../../ui';
import { AgentEditor } from './AgentEditor';
import { FormActions } from './FormActions';
import { withGlobalWarning } from './text';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

const EMPTY = { name: '', description: '', body: '', model: '' };

/**
 * Os agentes de um escopo: arquivos de agente da ferramenta, com a marcação "disponível no board" em cada
 * um, o padrão, e as ações de criar (à mão, pela IA ou os de fábrica), editar e apagar.
 */
export function AgentsTable({ tool, scope }: { tool: AiToolInfo; scope: InstallScope }) {
  const state = useBoardStore((s) => s.state)!;
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const agents = state.harness.agents.filter((a) => a.scope === scope);
  const defaultName = state.board.execProfiles.find((p) => p.isDefault && p.scope !== 'builtin')?.id ?? '';
  const available = (a: Agent) => usageOf(state.harnessSelection, { kind: 'agent', location: a.location }) !== null;
  const busy = state.chat.busy;
  const nameOk = isFreeName(draft.name, state.harness.agents);
  const create = () => {
    harness.createAgent(scope, {
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
    <div className="agents-table">
      <p className="muted small">
        {rich(
          'Um agente é um arquivo de agente do {tool} em <code>{dir}</code>: as instruções são o papel da sessão, e o frontmatter diz o modelo, as ferramentas, as skills e os servidores MCP que ela recebe. <b>Disponível no board</b> é o que os cards e as fases podem escolher; o <b>padrão</b> executa quando nenhum deles escolhe.',
          {
            tool: tool.label,
            dir: scope === 'project' ? tool.agents.dir : `~/${tool.agents.dir}`,
          },
        )}
      </p>
      <div className="row selection-actions">
        <Button onClick={() => setCreating(!creating)}>
          <IconPlus /> {t('Novo agente')}
        </Button>
        <Button
          variant="soft"
          color="gray"
          disabled={busy}
          title={
            busy
              ? t('A IA ainda está respondendo no chat do board.')
              : t('A IA lê o projeto e cria ou ajusta os agentes; acompanhe no chat do board.')
          }
          onClick={() => ai.suggestAgents()}
        >
          {t('Sugerir agentes com IA')}
        </Button>
        {scope === 'user' && (
          <Button
            variant="ghost"
            size="1"
            title={t('Cria de novo os agentes de fábrica que não existem mais; não mexe nos que existem.')}
            onClick={() => harness.seedAgents(true)}
          >
            {t('Recriar os agentes padrão')}
          </Button>
        )}
      </div>
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
                  {on && a.name === defaultName && (
                    <Badge color="indigo" variant="soft">
                      {t('padrão')}
                    </Badge>
                  )}{' '}
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
                    title={t('Abre o arquivo no editor')}
                    onClick={() => harness.openItem(a.path)}
                  >
                    {a.location}
                  </button>
                </td>
                <td className="narrow">
                  <div className="row-actions">
                    {on && a.name !== defaultName && (
                      <Button
                        variant="ghost"
                        size="1"
                        title={t('Usado quando nem o card nem a coluna indicam um agente')}
                        onClick={() => settings.updateBoard({ runner: { defaultAgent: a.name } })}
                      >
                        {t('Tornar padrão')}
                      </Button>
                    )}
                    <Button variant="ghost" size="1" onClick={() => setEditing(open ? null : a.location)}>
                      {open ? t('Fechar edição') : t('Editar')}
                    </Button>
                    <DeleteButton
                      title={t('Apagar o agente')}
                      question={t('Apagar o agente "{name}"?', { name: a.name })}
                      message={withGlobalWarning(
                        t('O arquivo é removido: {location}. Colunas e cards que usam este agente voltam ao padrão.', {
                          location: a.location,
                        }),
                        a.scope,
                      )}
                      onConfirm={() => harness.deleteAgent(a.name, a.scope)}
                    />
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
                {t('Nenhum agente do {tool} neste escopo.', { tool: tool.label })}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
