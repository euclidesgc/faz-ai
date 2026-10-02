import { useEffect, useState } from 'react';
import { AI_TOOLS, HARNESS_KINDS, HARNESS_SCOPES, SKILL_MODES, SKILL_NAME_PATTERN, type AiTool, type HarnessItem, type HarnessKind, type SkillMode } from '../../../shared/harness';
import { MCP_NAME_PATTERN, copyTarget, createTargets, mcpTargets, type CreateTarget, type McpTarget } from '../../../shared/harnessCatalog';
import { useBoardStore } from '../../store/boardStore';

const GLOBAL_WARNING = 'O arquivo fica na sua pasta de usuário e vale para todos os seus projetos.';

/** Formulário de um item novo: onde criar e, quando o lugar pede, nome e descrição. */
function NewItem({ tool, kind, targets, onClose }: { tool: AiTool; kind: HarnessKind; targets: CreateTarget[]; onClose: () => void }) {
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [source, setSource] = useState(targets[0]!.source);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const target = targets.find((t) => t.source === source)!;
  const named = target.layout !== 'file';
  const needsDescription = target.layout === 'skills' || kind === 'agent';
  const ok = (!named || SKILL_NAME_PATTERN.test(name)) && (!needsDescription || description.trim() !== '');
  const create = () => {
    const run = () => {
      send({ type: 'harness.item.create', tool, source, name, description: description.trim() });
      onClose();
    };
    if (target.scope === 'user') ask({ title: 'Criar na pasta do usuário?', message: `${target.label.replace('<nome>', name)}\n\n${GLOBAL_WARNING}`, confirmLabel: 'Criar', onConfirm: run });
    else run();
  };
  return (
    <div className="harness-new">
      <label className="field-row">
        <span>Onde</span>
        <select value={source} onChange={(e) => setSource(Number(e.target.value))}>
          {targets.map((t) => <option key={t.source} value={t.source}>{t.scope === 'user' ? 'Global' : 'Projeto'}: {t.label}</option>)}
        </select>
      </label>
      {named && (
        <label className="field-row">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="revisar-spec" />
        </label>
      )}
      {named && (
        <label className="field-row">
          <span>Descrição{needsDescription ? '' : ' (opcional)'}</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando a IA deve usar" />
        </label>
      )}
      <div className="row">
        <button className="primary" disabled={!ok} onClick={create}>Criar e abrir no editor</button>
        <button className="ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

/** `CHAVE=valor`, um por linha. */
const pairs = (text: string): Record<string, string> =>
  Object.fromEntries(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

/** Formulário de um servidor MCP novo: em que arquivo gravar, e o comando ou o endereço. */
function NewMcpServer({ tool, targets, onClose }: { tool: AiTool; targets: McpTarget[]; onClose: () => void }) {
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [source, setSource] = useState(targets[0]!.source);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [extra, setExtra] = useState('');
  const target = targets.find((t) => t.source === source)!;
  const ok = MCP_NAME_PATTERN.test(name) && (transport === 'stdio' ? command.trim() !== '' : /^https?:\/\/\S+$/.test(url.trim()));
  const add = () => {
    const run = () => {
      const server = { name, transport, command, args: args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean), env: transport === 'stdio' ? pairs(extra) : {}, url, headers: transport === 'http' ? pairs(extra) : {} };
      send({ type: 'harness.mcp.add', tool, source, server });
      onClose();
    };
    if (target.scope === 'user') ask({ title: 'Acrescentar servidor na pasta do usuário?', message: `${target.label}\n\n${GLOBAL_WARNING}`, confirmLabel: 'Acrescentar', onConfirm: run });
    else run();
  };
  return (
    <div className="harness-new">
      <label className="field-row">
        <span>Arquivo</span>
        <select value={source} onChange={(e) => setSource(Number(e.target.value))}>
          {targets.map((t) => <option key={t.source} value={t.source}>{t.scope === 'user' ? 'Global' : 'Projeto'}: {t.label}</option>)}
        </select>
      </label>
      <label className="field-row">
        <span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="github" />
      </label>
      <label className="field-row">
        <span>Tipo</span>
        <select value={transport} onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}>
          <option value="stdio">Comando local (stdio)</option>
          <option value="http">Endereço (HTTP)</option>
        </select>
      </label>
      {transport === 'stdio' ? (
        <>
          <label className="field-row"><span>Comando</span><input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" /></label>
          <label className="field-row"><span>Argumentos</span><textarea rows={2} value={args} onChange={(e) => setArgs(e.target.value)} placeholder="um por linha" spellCheck={false} /></label>
        </>
      ) : (
        <label className="field-row"><span>Endereço</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.dev/mcp" /></label>
      )}
      <label className="field-row">
        <span>{transport === 'stdio' ? 'Variáveis de ambiente' : 'Cabeçalhos'}</span>
        <textarea rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="CHAVE=valor, um por linha" spellCheck={false} />
      </label>
      <p className="muted small">Variáveis e cabeçalhos são gravados no arquivo como estão. Se o arquivo vai para o repositório, não ponha segredos nele.</p>
      <div className="row">
        <button className="primary" disabled={!ok} onClick={add}>Acrescentar servidor</button>
        <button className="ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

/** Tudo que cada ferramenta de IA carrega: por tipo de componente e por escopo (projeto, global, plugins). */
export function HarnessInventory() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [tool, setTool] = useState<AiTool>(state.board.aiTool);
  const [creating, setCreating] = useState<HarnessKind | null>(null);
  // a pasta do usuário não é vigiada: relê ao abrir a tela
  useEffect(() => send({ type: 'harness.refresh' }), [send]);

  const inventory = state.harness.inventory;
  const items = inventory.find((t) => t.tool === tool)?.items ?? [];
  const label = (id: AiTool) => AI_TOOLS.find((t) => t.id === id)!.label;
  const missing = inventory.filter((t) => !t.installed && t.items.length === 0).map((t) => label(t.tool));
  const targets = createTargets(tool);
  const mcpFiles = mcpTargets(tool);

  const copyable = (i: HarnessItem, to: 'project' | 'user') => (i.layout === 'files' || i.layout === 'skills') && i.scope !== to && !!copyTarget(tool, i.kind, i.layout, to);
  /** o mesmo item no outro escopo: dá para ver se já foi copiado e se a cópia divergiu */
  const twin = (i: HarnessItem, scope: 'project' | 'user') => items.find((x) => x.kind === i.kind && x.name === i.name && x.scope === scope && x.layout === i.layout);
  const copy = (list: HarnessItem[], to: 'project' | 'user') => {
    const run = () => send({ type: 'harness.item.copy', tool, items: list.map((i) => ({ kind: i.kind, path: i.path })), to });
    const what = list.length === 1 ? `"${list[0]!.name}"` : `${list.length} itens`;
    if (to === 'user') ask({ title: `Copiar ${what} para a pasta do usuário?`, message: GLOBAL_WARNING, confirmLabel: 'Copiar', onConfirm: run });
    else if (list.length > 1) ask({ title: `Copiar ${what} para o projeto?`, message: 'Cada item vira uma cópia independente na pasta do projeto.', confirmLabel: 'Copiar', onConfirm: run });
    else run();
  };
  const setMode = (list: HarnessItem[], mode: SkillMode) => {
    const run = () => send({ type: 'harness.skill.setMode', tool, paths: list.map((i) => i.path), mode });
    if (list.some((i) => i.scope === 'user')) ask({ title: 'Alterar skills da pasta do usuário?', message: `A mudança é gravada no arquivo da skill. ${GLOBAL_WARNING}`, confirmLabel: 'Alterar', onConfirm: run });
    else run();
  };
  /** skills cuja descrição a ferramenta carrega em toda sessão */
  const automatic = items.filter((i) => i.kind === 'skill' && i.mode === 'auto');
  const remove = (i: HarnessItem) =>
    ask({
      title: `Apagar "${i.name}"?`,
      message: `${i.layout === 'skills' ? 'A pasta da skill é removida, com todos os arquivos dela' : 'O arquivo é removido'}: ${i.location}${i.scope === 'user' ? `\n\n${GLOBAL_WARNING}` : ''}`,
      confirmLabel: 'Apagar',
      danger: true,
      onConfirm: () => send({ type: 'harness.item.delete', tool, kind: i.kind, path: i.path }),
    });

  const row = (i: HarnessItem) => {
    const inProject = i.scope !== 'project' ? twin(i, 'project') : undefined;
    const editable = i.scope !== 'plugin' && i.layout !== 'entry';
    return (
      <tr key={`${i.path}|${i.name}`}>
        <td>
          {i.name}
          {i.plugin && <span className="pill off">{i.plugin}</span>}
          {inProject && <span className="pill" title={inProject.location}>{inProject.digest === i.digest ? 'copiada no projeto' : 'no projeto, com conteúdo diferente'}</span>}
        </td>
        <td className="muted small">{i.description || '—'}</td>
        <td className="muted small"><code>{i.location}</code></td>
        <td className="actions">
          {i.mode && (editable ? (
            <select title={SKILL_MODES.find((m) => m.id === i.mode)!.hint} value={i.mode} onChange={(e) => setMode([i], e.target.value as SkillMode)}>
              {SKILL_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : (
            <span className="pill off" title="Skill de plugin: o modo não pode ser alterado aqui. Para mudar, copie a skill para o projeto.">{SKILL_MODES.find((m) => m.id === i.mode)!.label}</span>
          ))}
          <button className="ghost small" title={editable ? 'Abre o arquivo no editor, onde ele pode ser alterado' : 'Abre o arquivo no editor'} onClick={() => send({ type: 'harness.item.open', path: i.path })}>Abrir</button>
          {copyable(i, 'project') && !inProject && <button className="ghost small" title="Cria uma cópia independente na pasta do projeto" onClick={() => copy([i], 'project')}>Copiar para o projeto</button>}
          {copyable(i, 'user') && !twin(i, 'user') && <button className="ghost small" title="Cria uma cópia na sua pasta de usuário, que vale em todos os projetos" onClick={() => copy([i], 'user')}>Copiar para o global</button>}
          {editable && i.kind !== 'settings' && <button className="icon danger" title="Apagar" onClick={() => remove(i)}>🗑</button>}
          {i.kind === 'mcp' && i.scope !== 'plugin' && mcpFiles.some((t) => t.label === i.location) && (
            <button
              className="icon danger"
              title="Remover o servidor deste arquivo"
              onClick={() => ask({ title: `Remover o servidor "${i.name}"?`, message: `A entrada sai de ${i.location}.${i.scope === 'user' ? `\n\n${GLOBAL_WARNING}` : ''}`, confirmLabel: 'Remover', danger: true, onConfirm: () => send({ type: 'harness.mcp.remove', tool, path: i.path, name: i.name }) })}
            >🗑</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="harness-inventory">
      <div className="row section-head">
        <h3>Tudo que cada ferramenta carrega</h3>
        <span className="spacer" />
        <button title="Relê as pastas do projeto e do usuário" onClick={() => send({ type: 'harness.refresh' })}>Atualizar</button>
      </div>
      <p className="muted small">
        O que cada ferramenta de IA lê neste projeto e na sua pasta de usuário, separado por escopo. <b>Projeto</b> vale só aqui; <b>Global</b> vale
        em todos os seus projetos; <b>Plugins</b> vem de pacotes instalados e não pode ser alterado, mas pode ser copiado. "Abrir" mostra o arquivo no
        editor, onde ele também é editado.
      </p>
      <div className="tabs">
        {inventory.map((t) => (
          <button key={t.tool} className={t.tool === tool ? 'active' : ''} onClick={() => { setTool(t.tool); setCreating(null); }}>
            {label(t.tool)}
            {t.tool === state.board.aiTool && <span className="pill">deste projeto</span>}
            {!t.installed && <span className="pill off">não encontrada</span>}
          </button>
        ))}
      </div>
      {missing.length > 0 && <p className="muted small">Sem sinal de instalação nesta máquina: {missing.join(', ')}.</p>}
      {HARNESS_KINDS.map((k) => {
        const ofKind = items.filter((i) => i.kind === k.id);
        // arquivo fixo que já existe não é oferecido de novo
        const places = targets.filter((t) => t.kind === k.id && !(t.layout === 'file' && ofKind.some((i) => i.location === t.label)));
        return (
          <section key={k.id} className="settings-block">
            <div className="row">
              <h3 className="plain">{k.label}</h3>
              <span className="pill off">{ofKind.length}</span>
              <span className="muted small">{k.hint}</span>
              <span className="spacer" />
              {(places.length > 0 || (k.id === 'mcp' && mcpFiles.length > 0)) && <button className="small" onClick={() => setCreating(creating === k.id ? null : k.id)}>Novo</button>}
            </div>
            {creating === 'mcp' && k.id === 'mcp' && mcpFiles.length > 0 && <NewMcpServer key={tool} tool={tool} targets={mcpFiles} onClose={() => setCreating(null)} />}
            {k.id === 'mcp' && tool === 'claude' && <p className="muted small">Os servidores do <code>~/.claude.json</code> aparecem aqui, mas são alterados pelo Claude Code: <code>claude mcp add --scope user …</code> e <code>claude mcp remove …</code>.</p>}
            {creating === k.id && places.length > 0 && <NewItem key={tool} tool={tool} kind={k.id} targets={places} onClose={() => setCreating(null)} />}
            {k.id === 'skill' && automatic.length > 0 && (
              <p className="muted small">
                {automatic.length} skills automáticas: as descrições delas, {automatic.reduce((n, i) => n + i.description.length, 0).toLocaleString('pt-BR')} caracteres
                ao todo, entram em toda sessão do {label(tool)}. As demais só são lidas quando indicadas.
              </p>
            )}
            {ofKind.length === 0 && <p className="muted small">Nada encontrado para o {label(tool)}.</p>}
            {HARNESS_SCOPES.map((s) => {
              const group = ofKind.filter((i) => i.scope === s.id);
              if (!group.length) return null;
              const toProject = s.id === 'project' ? [] : group.filter((i) => copyable(i, 'project') && !twin(i, 'project'));
              return (
                <details key={s.id} open={s.id !== 'plugin' || group.length <= 12}>
                  <summary title={s.hint}>
                    {s.label} <span className="muted small">({group.length})</span>
                    {s.id !== 'plugin' && group.filter((i) => i.mode === 'auto').length > 1 && (
                      <button className="ghost small" title="A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam" onClick={(e) => { e.preventDefault(); setMode(group.filter((i) => i.mode === 'auto'), 'manual'); }}>Deixar todas só quando indicadas</button>
                    )}
                    {toProject.length > 1 && <button className="ghost small" onClick={(e) => { e.preventDefault(); copy(toProject, 'project'); }}>Copiar todas para o projeto ({toProject.length})</button>}
                  </summary>
                  <table className="table">
                    <tbody>{group.map(row)}</tbody>
                  </table>
                </details>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
