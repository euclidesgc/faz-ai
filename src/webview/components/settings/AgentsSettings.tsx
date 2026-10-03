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
        name: `Agente ${profiles.length + 1}`,
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
          ? `Na execução pelo board, o ${tool.label} recebe isto por parâmetro: a sessão não tem como usar outra coisa.`
          : `O ${tool.label} não aceita isto por parâmetro: segue no prompt, como instrução.`
      }
    >
      {how[aspect] === 'enforced' ? 'imposto' : 'orientado'}
    </Badge>
  );
  /** o resumo de uma linha do que o agente restringe; sem nada, ele não restringe */
  const summary = (p: ExecProfile): string =>
    [
      p.agent && `subagente ${p.agent}`,
      p.skills.length && `${p.skills.length} skill(s)`,
      p.mcpServers && `MCP: board${p.mcpServers.length ? ` + ${p.mcpServers.join(', ')}` : ''}`,
      p.tools.length && `ferramentas: ${p.tools.join(', ')}`,
      p.clean && 'sessão limpa',
    ]
      .filter(Boolean)
      .join(' · ') || 'Sem restrições: a sessão usa o que a ferramenta carregar.';

  return (
    <div>
      <PageHeader
        title="Agentes"
        actions={
          <Button onClick={add}>
            <IconPlus /> Novo agente
          </Button>
        }
      >
        Um agente diz como a IA trabalha num card: que skills ela lê, a que servidores MCP e ferramentas ela tem acesso e que modelo usa.
        Toda execução pelo board ("Chamar IA" e heartbeat) roda através de um agente: o escolhido no card; senão, o da fase (Workflows e
        colunas → Fase); senão, o padrão. Assim isso é decidido antes, em vez de a ferramenta descobrir sozinha durante a conversa.
      </PageHeader>
      <details className="agents-help">
        <summary>O que o {tool.label} aceita por parâmetro</summary>
        <p className="muted small">
          Cada execução pelo board é uma sessão nova, só com o que está no card. <b>Imposto</b> é o que o {tool.label} recebe por parâmetro;{' '}
          <b>orientado</b> segue como instrução no prompt. Numa conversa aberta por você, tudo é orientação: a IA lê o agente em{' '}
          <code>get_card</code>. As skills vão sempre pelo caminho do arquivo, no prompt: valem mesmo desligadas ou fora da invocação
          automática.
        </p>
        <table className="table">
          <thead>
            <tr>
              {EXEC_ASPECTS.map((a) => (
                <th key={a.id}>{a.label}</th>
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
            <Card key={p.id} className="settings-card" aria-label={`Agente ${p.name}`}>
              <div className="settings-card-head">
                <TextField.Root
                  className="profile-name"
                  aria-label="Nome do agente"
                  key={p.name}
                  defaultValue={p.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && patch(p.id, { name: e.target.value.trim() })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                {p.isDefault && (
                  <Badge color="indigo" variant="soft">
                    padrão
                  </Badge>
                )}
                <div className="settings-card-actions">
                  {!p.isDefault && (
                    <Button
                      variant="ghost"
                      size="1"
                      title="Usado quando nem o card nem a coluna indicam um agente"
                      onClick={() => patch(p.id, { isDefault: true })}
                    >
                      Tornar padrão
                    </Button>
                  )}
                  <Button variant="soft" color="gray" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? 'Fechar' : 'Editar'}
                  </Button>
                  <DeleteButton
                    title={profiles.length === 1 ? 'Precisa haver ao menos um agente' : 'Apagar o agente'}
                    disabled={profiles.length === 1}
                    question={`Apagar o agente "${p.name}"?`}
                    message="Colunas e cards que usam este agente voltam ao padrão."
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
                    label="O que este agente faz"
                    hint="Uma frase, como na descrição de um agente. É a base para sugerir skills e servidores MCP."
                  >
                    {(id) => (
                      <TextArea
                        id={id}
                        rows={2}
                        key={p.purpose}
                        defaultValue={p.purpose}
                        placeholder="Ex.: revisa a Spec e aponta lacunas antes do Plan"
                        onBlur={(e) => e.target.value.trim() !== p.purpose && patch(p.id, { purpose: e.target.value.trim() })}
                      />
                    )}
                  </FormField>
                  <FormField
                    label={<>Skills {badge('skills')}</>}
                    hint="Lidas em toda execução com este agente, além das indicadas no card. Com a intenção preenchida, o botão Sugerir pela intenção marca as que combinam."
                  >
                    {() => (
                      <SkillPicker
                        value={p.skills}
                        onChange={(next) => patch(p.id, { skills: next })}
                        intent={p.purpose}
                        title={`Skills de ${p.name}`}
                      />
                    )}
                  </FormField>
                  <FormField label={<>Servidores MCP {badge('mcp')}</>}>
                    {() => (
                      <>
                        <SwitchField
                          label="Restringir: a sessão usa só o servidor do board e os marcados abaixo"
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
                              <span className="muted small">Nenhum outro servidor configurado para o {tool.label}.</span>
                            )}
                            {suggestedServers.length > 0 && (
                              <Button
                                variant="ghost"
                                size="1"
                                title="Servidores cujo nome ou descrição combinam com a intenção"
                                onClick={() => patch(p.id, { mcpServers: [...new Set([...(p.mcpServers ?? []), ...suggestedServers])] })}
                              >
                                Sugerir pela intenção ({suggestedServers.length})
                              </Button>
                            )}
                          </ChipsEditor>
                        )}
                      </>
                    )}
                  </FormField>
                  <FormField
                    label={<>Ferramentas disponíveis {badge('tools')}</>}
                    hint="Nomes separados por vírgula, como a ferramenta os chama; vazio = as que o nível de permissão da execução libera."
                  >
                    {(id) => (
                      <>
                        <div className="agent-presets">
                          {TOOL_PRESETS.map((t) => (
                            <Button
                              key={t.id}
                              variant="soft"
                              color="gray"
                              size="1"
                              title={t.hint}
                              onClick={() => patch(p.id, { tools: t.tools })}
                            >
                              {t.label}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="1"
                            title="Sem lista: vale o que o nível de permissão libera"
                            onClick={() => patch(p.id, { tools: [] })}
                          >
                            Liberar o padrão
                          </Button>
                        </div>
                        <TextField.Root
                          id={id}
                          key={p.tools.join()}
                          defaultValue={p.tools.join(', ')}
                          placeholder="Ex.: Read, Grep, Glob, Edit"
                          onBlur={(e) => patch(p.id, { tools: list(e.target.value) })}
                        />
                      </>
                    )}
                  </FormField>
                  <FormField label={<>Ferramentas negadas {badge('tools')}</>}>
                    {(id) => (
                      <TextField.Root
                        id={id}
                        key={p.deniedTools.join()}
                        defaultValue={p.deniedTools.join(', ')}
                        placeholder="Ex.: WebFetch, Bash(git push *)"
                        onBlur={(e) => patch(p.id, { deniedTools: list(e.target.value) })}
                      />
                    )}
                  </FormField>
                  <FormField label={<>Modelo e esforço {badge('model')}</>} hint="O modelo indicado no card tem preferência.">
                    {() => <ModelEditor value={p.model || null} onChange={(v) => patch(p.id, { model: typeof v === 'string' ? v : '' })} />}
                  </FormField>
                  <FormField
                    label={
                      <>
                        Subagente do {tool.label} {badge('agent')}
                      </>
                    }
                    hint={`Opcional: um arquivo de agente do ${tool.label} (em Harness de IA → Agentes) que conduz a sessão; vazio = o agente padrão da ferramenta.`}
                  >
                    {(id) => (
                      <SelectField
                        id={id}
                        aria-label="Subagente"
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
                    label={
                      <>
                        Sessão limpa {badge('clean')}: sem as personalizações da sua pasta de usuário e sem invocação automática de skills
                      </>
                    }
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
