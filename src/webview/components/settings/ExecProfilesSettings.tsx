import { useState } from 'react';
import { EXEC_ASPECTS, EXEC_ENFORCEMENT, type ExecAspect, type ExecProfile } from '../../../shared/execution';
import { aiToolInfo } from '../../../shared/harness';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { ModelEditor } from '../FieldRenderer';
import { Badge, Button, Card, TextField } from '@radix-ui/themes';
import { ChipsEditor, DeleteButton, FormField, IconPlus, SelectField, SwitchField } from '../ui';
import { PageHeader } from './PageHeader';

/** O Select do Radix não aceita `value` vazio: "sem agente" usa este valor. */
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

/** Perfis de execução: o que a sessão de IA recebe para trabalhar num card, definido antes da execução. */
export function ExecProfilesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [open, setOpen] = useState<string | null>(null);
  const profiles = state.board.execProfiles;
  const tool = aiToolInfo(state.board.aiTool);
  const how = EXEC_ENFORCEMENT[tool.id];
  const items = state.harness.inventory.find((t) => t.tool === tool.id)?.items ?? [];
  const agents = [...new Set(items.filter((i) => i.kind === 'agent').map((i) => i.name))].sort();
  const servers = [...new Set(items.filter((i) => i.kind === 'mcp').map((i) => i.name))].filter((n) => n !== 'faz-ai').sort();
  const skills = state.fieldDefs.find((f) => f.kind === 'multiselect' && f.name.toLowerCase() === 'skills')?.options ?? [];

  const save = (next: ExecProfile[]) => settings.setExecProfiles(next);
  const patch = (id: string, p: Partial<ExecProfile>) =>
    save(profiles.map((x) => (x.id === id ? { ...x, ...p } : p.isDefault ? { ...x, isDefault: false } : x)));
  const add = () => {
    const id = newId();
    save([
      ...profiles,
      {
        id,
        name: `Perfil ${profiles.length + 1}`,
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
  return (
    <div>
      <PageHeader
        title="Perfis de execução"
        actions={
          <Button onClick={add}>
            <IconPlus /> Novo perfil
          </Button>
        }
      >
        Um perfil diz o que a sessão de IA usa para trabalhar num card: agente, skills, servidores MCP, ferramentas e modelo. Assim isso é
        decidido antes, em vez de a ferramenta descobrir sozinha durante a conversa. O perfil vale por fase (em Workflows e colunas → Fase)
        e pode ser trocado em cada card; sem nenhum dos dois, vale o perfil padrão.
      </PageHeader>
      <p className="muted small">
        Cada execução pelo board ("Chamar IA" e heartbeat) é uma sessão nova, só com o que está no card. <b>Imposto</b> é o que o{' '}
        {tool.label} recebe por parâmetro nessa execução; <b>orientado</b> segue como instrução no prompt. Numa conversa aberta por você,
        tudo é orientação: a IA lê o perfil em <code>get_card</code>.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Com o {tool.label}</th>
            {EXEC_ASPECTS.map((a) => (
              <th key={a.id}>{a.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="muted small">na execução pelo board</td>
            {EXEC_ASPECTS.map((a) => (
              <td key={a.id}>{badge(a.id)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        As skills vão sempre pelo caminho do arquivo, no prompt: valem mesmo desligadas ou fora da invocação automática.
      </p>

      <div className="profile-list">
        {profiles.map((p) => (
          <Card key={p.id} className="settings-card" aria-label={`Perfil ${p.name}`}>
            <div className="settings-card-head">
              <TextField.Root
                className="profile-name"
                aria-label="Nome do perfil"
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
                    title="Usado quando nem o card nem a coluna indicam um perfil"
                    onClick={() => patch(p.id, { isDefault: true })}
                  >
                    Tornar padrão
                  </Button>
                )}
                <Button variant="soft" color="gray" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  {open === p.id ? 'Fechar' : 'Editar'}
                </Button>
                <DeleteButton
                  title="Apagar o perfil"
                  question={`Apagar o perfil "${p.name}"?`}
                  message="Colunas e cards que usam este perfil voltam ao padrão."
                  onConfirm={() => save(profiles.filter((x) => x.id !== p.id))}
                />
              </div>
            </div>
            <div className="muted small">
              {[
                p.agent && `agente ${p.agent}`,
                p.skills.length && `${p.skills.length} skill(s)`,
                p.mcpServers && `MCP: board${p.mcpServers.length ? ` + ${p.mcpServers.join(', ')}` : ''}`,
                p.tools.length && `ferramentas: ${p.tools.join(', ')}`,
                p.clean && 'sessão limpa',
              ]
                .filter(Boolean)
                .join(' · ') || 'Sem restrições: a sessão usa o que a ferramenta carregar.'}
            </div>
            {open === p.id && (
              <div className="profile-editor">
                <FormField label={<>Agente {badge('agent')}</>} hint="Quem conduz a sessão; vazio = o agente padrão da ferramenta.">
                  {(id) => (
                    <SelectField
                      id={id}
                      aria-label="Agente"
                      options={[
                        { value: NO_AGENT, label: '—' },
                        ...[...new Set([...agents, ...(p.agent ? [p.agent] : [])])].map((a) => ({ value: a, label: a })),
                      ]}
                      value={p.agent || NO_AGENT}
                      onChange={(agent) => patch(p.id, { agent: agent === NO_AGENT ? '' : agent })}
                    />
                  )}
                </FormField>
                <FormField
                  label={<>Skills do perfil {badge('skills')}</>}
                  hint="Lidas em toda execução com este perfil, além das indicadas no card."
                >
                  {() => (
                    <ChipsEditor
                      options={[...new Set([...skills, ...p.skills])]}
                      values={p.skills}
                      onChange={(next) => patch(p.id, { skills: next })}
                    >
                      {skills.length === 0 && p.skills.length === 0 && <span className="muted small">Nenhuma skill encontrada.</span>}
                    </ChipsEditor>
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
                          options={[...new Set([...servers, ...p.mcpServers])]}
                          values={p.mcpServers}
                          onChange={(next) => patch(p.id, { mcpServers: next })}
                        >
                          {servers.length === 0 && (
                            <span className="muted small">Nenhum outro servidor configurado para o {tool.label}.</span>
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
                    <TextField.Root
                      id={id}
                      key={p.tools.join()}
                      defaultValue={p.tools.join(', ')}
                      placeholder="Ex.: Read, Grep, Glob, Edit"
                      onBlur={(e) => patch(p.id, { tools: list(e.target.value) })}
                    />
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
                <SwitchField
                  label={
                    <>Sessão limpa {badge('clean')}: sem as personalizações da sua pasta de usuário e sem invocação automática de skills</>
                  }
                  checked={p.clean}
                  onChange={(clean) => patch(p.id, { clean })}
                />
              </div>
            )}
          </Card>
        ))}
        {profiles.length === 0 && (
          <p className="muted">
            Nenhum perfil ainda. Sem perfil, a execução usa tudo que a ferramenta carregar, e só o modelo do card é passado a ela.
          </p>
        )}
      </div>
    </div>
  );
}
