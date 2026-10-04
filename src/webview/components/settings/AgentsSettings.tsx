import { useState } from 'react';
import { EXEC_ASPECTS, EXEC_ENFORCEMENT, TOOL_PRESETS, type ExecAspect, type ExecProfile } from '../../../shared/execution';
import { aiToolInfo } from '../../../shared/harness';
import { suggestSkills } from '../../../shared/skillCatalog';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { ModelEditor } from '../FieldRenderer';
import { SkillPicker } from '../skills/SkillPicker';
import { Badge, Button, Card, TextArea, TextField } from '@radix-ui/themes';
import { ChipsEditor, DeleteButton, FormField, IconPlus, SelectField, SwitchField } from '../ui';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/** O Select do Radix não aceita `value` vazio: "sem subagente" usa este valor. */
const NO_AGENT = '__none';
const newId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);
const list = (text: string): string[] => [
  ...new Set(
    text
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

/**
 * Agentes: o que a sessão de IA usa para trabalhar num card, definido antes da execução. Toda execução
 * pelo board roda através de um agente (o do card, o da fase ou o padrão). Guardados como perfis.
 */
export function AgentsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [open, setOpen] = useState<string | null>(null);
  const profiles = state.board.execProfiles;
  const tool = aiToolInfo(state.board.aiTool);
  const how = EXEC_ENFORCEMENT[tool.id];
  const items = state.harness.inventory.find((t) => t.tool === tool.id)?.items ?? [];
  const subagents = [...new Set(items.filter((i) => i.kind === 'agent').map((i) => i.name))].sort();
  const servers = [...new Map(items.filter((i) => i.kind === 'mcp' && i.name !== 'faz-ai').map((i) => [i.name, i])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const serverNames = servers.map((s) => s.name);

  const save = (next: ExecProfile[]) => settings.setExecProfiles(next);
  const patch = (id: string, p: Partial<ExecProfile>) =>
    save(profiles.map((x) => (x.id === id ? { ...x, ...p } : p.isDefault ? { ...x, isDefault: false } : x)));
  const add = () => {
    const id = newId();
    save([
      ...profiles,
      {
        id,
        name: t('Agente {n}', { n: profiles.length + 1 }),
        purpose: '',
        agent: '',
        skills: [],
        mcpServers: null,
        tools: [],
        deniedTools: [],
        model: '',
        clean: false,
        isDefault: profiles.length === 0,
      },
    ]);
    setOpen(id);
  };
  const badge = (aspect: ExecAspect) => (
    <Badge
      color={how[aspect] === 'enforced' ? 'indigo' : 'gray'}
      variant={how[aspect] === 'enforced' ? 'soft' : 'outline'}
      title={
        how[aspect] === 'enforced'
          ? t('Na execução pelo board, o {tool} recebe isto por parâmetro: a sessão não tem como usar outra coisa.', { tool: tool.label })
          : t('O {tool} não aceita isto por parâmetro: segue no prompt, como instrução.', { tool: tool.label })
      }
    >
      {how[aspect] === 'enforced' ? t('imposto') : t('orientado')}
    </Badge>
  );
  /** o resumo de uma linha do que o agente restringe; sem nada, ele não restringe */
  const summary = (p: ExecProfile): string =>
    [
      p.agent && t('subagente {name}', { name: p.agent }),
      p.skills.length && t('{n} skill(s)', { n: p.skills.length }),
      p.mcpServers && (p.mcpServers.length ? t('MCP: board + {list}', { list: p.mcpServers.join(', ') }) : t('MCP: board')),
      p.tools.length && t('ferramentas: {list}', { list: p.tools.join(', ') }),
      p.clean && t('sessão limpa'),
    ]
      .filter(Boolean)
      .join(' · ') || t('Sem restrições: a sessão usa o que a ferramenta carregar.');

  return (
    <div>
      <PageHeader
        title={t('Agentes')}
        actions={
          <Button onClick={add}>
            <IconPlus /> {t('Novo agente')}
          </Button>
        }
      >
        {t(
          'Um agente diz como a IA trabalha num card: que skills ela lê, a que servidores MCP e ferramentas ela tem acesso e que modelo usa. Toda execução pelo board ("Chamar IA" e heartbeat) roda através de um agente: o escolhido no card; senão, o da fase (Workflows e colunas → Fase); senão, o padrão. Assim isso é decidido antes, em vez de a ferramenta descobrir sozinha durante a conversa.',
        )}
      </PageHeader>
      <details className="agents-help">
        <summary>{t('O que o {tool} aceita por parâmetro', { tool: tool.label })}</summary>
        <p className="muted small">
          {rich(
            'Cada execução pelo board é uma sessão nova, só com o que está no card. <b>Imposto</b> é o que o {tool} recebe por parâmetro; <b>orientado</b> segue como instrução no prompt. Numa conversa aberta por você, tudo é orientação: a IA lê o agente em <code>get_card</code>. As skills vão sempre pelo caminho do arquivo, no prompt: valem mesmo desligadas ou fora da invocação automática.',
            { tool: tool.label },
          )}
        </p>
        <table className="table">
          <thead>
            <tr>
              {EXEC_ASPECTS.map((a) => (
                <th key={a.id}>{t(a.label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {EXEC_ASPECTS.map((a) => (
                <td key={a.id}>{badge(a.id)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </details>

      <div className="profile-list">
        {profiles.map((p) => {
          const suggestedServers = suggestSkills(
            p.purpose,
            servers.map((s) => ({ name: s.name, description: s.description, scope: 'user' as const })),
            5,
          ).map((s) => s.name);
          return (
            <Card key={p.id} className="settings-card" aria-label={t('Agente {name}', { name: p.name })}>
              <div className="settings-card-head">
                <TextField.Root
                  className="profile-name"
                  aria-label={t('Nome do agente')}
                  key={p.name}
                  defaultValue={p.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && patch(p.id, { name: e.target.value.trim() })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                {p.isDefault && (
                  <Badge color="indigo" variant="soft">
                    {t('padrão')}
                  </Badge>
                )}
                <div className="settings-card-actions">
                  {!p.isDefault && (
                    <Button
                      variant="ghost"
                      size="1"
                      title={t('Usado quando nem o card nem a coluna indicam um agente')}
                      onClick={() => patch(p.id, { isDefault: true })}
                    >
                      {t('Tornar agente padrão')}
                    </Button>
                  )}
                  <Button variant="soft" color="gray" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? t('Fechar edição') : t('Editar')}
                  </Button>
                  <DeleteButton
                    title={profiles.length === 1 ? t('Precisa haver ao menos um agente') : t('Apagar o agente')}
                    disabled={profiles.length === 1}
                    question={t('Apagar o agente "{name}"?', { name: p.name })}
                    message={t('Colunas e cards que usam este agente voltam ao padrão.')}
                    onConfirm={() =>
                      save(
                        profiles
                          .filter((x) => x.id !== p.id)
                          // apagar o padrão passa o posto para o primeiro que sobra
                          .map((x, i) => (p.isDefault ? { ...x, isDefault: i === 0 } : x)),
                      )
                    }
                  />
                </div>
              </div>
              {p.purpose && <div className="agent-purpose">{p.purpose}</div>}
              <div className="muted small">{summary(p)}</div>
              {open === p.id && (
                <div className="profile-editor">
                  <FormField
                    label={t('O que este agente faz')}
                    hint={t('Uma frase, como na descrição de um agente. É a base para sugerir skills e servidores MCP.')}
                  >
                    {(id) => (
                      <TextArea
                        id={id}
                        rows={2}
                        key={p.purpose}
                        defaultValue={p.purpose}
                        placeholder={t('Ex.: revisa a Spec e aponta lacunas antes do Plan')}
                        onBlur={(e) => e.target.value.trim() !== p.purpose && patch(p.id, { purpose: e.target.value.trim() })}
                      />
                    )}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Skills')} {badge('skills')}
                      </>
                    }
                    hint={t(
                      'Lidas em toda execução com este agente, além das indicadas no card. Com a intenção preenchida, o botão Sugerir pela intenção marca as que combinam.',
                    )}
                  >
                    {() => (
                      <SkillPicker
                        value={p.skills}
                        onChange={(next) => patch(p.id, { skills: next })}
                        intent={p.purpose}
                        title={t('Skills de {name}', { name: p.name })}
                      />
                    )}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Servidores MCP')} {badge('mcp')}
                      </>
                    }
                  >
                    {() => (
                      <>
                        <SwitchField
                          label={t('Restringir: a sessão usa só o servidor do board e os marcados abaixo')}
                          checked={p.mcpServers !== null}
                          onChange={(on) => patch(p.id, { mcpServers: on ? [] : null })}
                        />
                        {p.mcpServers !== null && (
                          <ChipsEditor
                            options={[...new Set([...serverNames, ...p.mcpServers])]}
                            values={p.mcpServers}
                            onChange={(next) => patch(p.id, { mcpServers: next })}
                          >
                            {serverNames.length === 0 && (
                              <span className="muted small">
                                {t('Nenhum outro servidor configurado para o {tool}.', { tool: tool.label })}
                              </span>
                            )}
                            {suggestedServers.length > 0 && (
                              <Button
                                variant="ghost"
                                size="1"
                                title={t('Servidores cujo nome ou descrição combinam com a intenção')}
                                onClick={() => patch(p.id, { mcpServers: [...new Set([...(p.mcpServers ?? []), ...suggestedServers])] })}
                              >
                                {t('Sugerir pela intenção ({n})', { n: suggestedServers.length })}
                              </Button>
                            )}
                          </ChipsEditor>
                        )}
                      </>
                    )}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Ferramentas disponíveis')} {badge('tools')}
                      </>
                    }
                    hint={t(
                      'Nomes separados por vírgula, como a ferramenta os chama; vazio = as que o nível de permissão da execução libera.',
                    )}
                  >
                    {(id) => (
                      <>
                        <div className="agent-presets">
                          {TOOL_PRESETS.map((preset) => (
                            <Button
                              key={preset.id}
                              variant="soft"
                              color="gray"
                              size="1"
                              title={t(preset.hint)}
                              onClick={() => patch(p.id, { tools: preset.tools })}
                            >
                              {t(preset.label)}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="1"
                            title={t('Sem lista: vale o que o nível de permissão libera')}
                            onClick={() => patch(p.id, { tools: [] })}
                          >
                            {t('Usar as ferramentas do nível de permissão')}
                          </Button>
                        </div>
                        <TextField.Root
                          id={id}
                          key={p.tools.join()}
                          defaultValue={p.tools.join(', ')}
                          placeholder={t('Ex.: Read, Grep, Glob, Edit')}
                          onBlur={(e) => patch(p.id, { tools: list(e.target.value) })}
                        />
                      </>
                    )}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Ferramentas negadas')} {badge('tools')}
                      </>
                    }
                  >
                    {(id) => (
                      <TextField.Root
                        id={id}
                        key={p.deniedTools.join()}
                        defaultValue={p.deniedTools.join(', ')}
                        placeholder={t('Ex.: WebFetch, Bash(git push *)')}
                        onBlur={(e) => patch(p.id, { deniedTools: list(e.target.value) })}
                      />
                    )}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Modelo e esforço')} {badge('model')}
                      </>
                    }
                    hint={t('O modelo indicado no card tem preferência.')}
                  >
                    {() => <ModelEditor value={p.model || null} onChange={(v) => patch(p.id, { model: typeof v === 'string' ? v : '' })} />}
                  </FormField>
                  <FormField
                    label={
                      <>
                        {t('Subagente do {tool}', { tool: tool.label })} {badge('agent')}
                      </>
                    }
                    hint={t(
                      'Opcional: um arquivo de agente do {tool} (em Harness de IA → Agentes) que conduz a sessão; vazio = o agente padrão da ferramenta.',
                      {
                        tool: tool.label,
                      },
                    )}
                  >
                    {(id) => (
                      <SelectField
                        id={id}
                        aria-label={t('Subagente')}
                        options={[
                          { value: NO_AGENT, label: '—' },
                          ...[...new Set([...subagents, ...(p.agent ? [p.agent] : [])])].map((a) => ({ value: a, label: a })),
                        ]}
                        value={p.agent || NO_AGENT}
                        onChange={(agent) => patch(p.id, { agent: agent === NO_AGENT ? '' : agent })}
                      />
                    )}
                  </FormField>
                  <SwitchField
                    label={rich(
                      'Sessão limpa {badge}: sem as personalizações da sua pasta de usuário e sem invocação automática de skills',
                      {
                        badge: badge('clean'),
                      },
                    )}
                    checked={p.clean}
                    onChange={(clean) => patch(p.id, { clean })}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
