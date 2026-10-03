import { useEffect, useState } from 'react';
import {
  AI_TOOLS,
  RULE_FILES,
  SKILL_MODES,
  SKILL_NAME_PATTERN,
  aiToolInfo,
  type Agent,
  type AiTool,
  type RuleFile,
  type Skill,
  type SkillMode,
} from '../../../shared/harness';
import { HEARTBEAT_RANGE, RUNNER_PERMISSIONS, TIMEOUT_RANGE } from '../../../shared/runner';
import { useBoardStore } from '../../store/boardStore';
import { ai, harness, settings, ui } from '../../commands';
import { Button, DeleteButton, EnumSelect, FieldRow, NumberField } from '../ui';
import { HarnessInventory } from './HarnessInventory';

// SKILL_MODES usa `id`; o seletor espera `value`
const SKILL_MODE_OPTIONS = SKILL_MODES.map((m) => ({ value: m.id, label: m.label }));

type Editing =
  | { kind: 'rule'; name: string }
  | { kind: 'skill'; name: string }
  | { kind: 'agent'; name: string }
  | { kind: 'newSkill' }
  | { kind: 'newAgent' }
  | null;

/** Editor de texto simples com salvar/descartar; `saved` é o conteúdo que está no disco. */
function FileEditor({ saved, onSave, onClose }: { saved: string; onSave: (content: string) => void; onClose: () => void }) {
  const [text, setText] = useState(saved);
  // se o arquivo mudou por fora e não há edição local pendente, acompanha o disco
  const [base, setBase] = useState(saved);
  useEffect(() => {
    if (text === base) setText(saved);
    setBase(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const dirty = text !== saved;
  return (
    <div className="file-editor">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} />
      <div className="row">
        <Button variant="primary" disabled={!dirty} onClick={() => onSave(text)}>
          Salvar
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {dirty ? 'Descartar' : 'Fechar'}
        </Button>
        {dirty && <span className="muted small">Alterações não salvas</span>}
      </div>
    </div>
  );
}

const FLOW_SKILL_NAME = 'faz-ai-fluxo';

export function HarnessSettings() {
  const state = useBoardStore((s) => s.state)!;
  const harnessState = state.harness;
  const tool = aiToolInfo(state.board.aiTool);
  const agents = harnessState.rules.find((r) => r.name === 'AGENTS.md');
  const chooseTool = (id: AiTool) => id !== tool.id && settings.updateBoard({ aiTool: id });
  // o arquivo de regras da ferramenta em uso; com o Claude Code, o AGENTS.md também aparece porque pode ser importado
  const rules = harnessState.rules.filter((r) => r.name === tool.rules || (tool.id === 'claude' && r.name === 'AGENTS.md' && r.exists));
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');

  const isEditing = (kind: 'rule' | 'skill' | 'agent', n: string) => editing !== null && editing.kind === kind && editing.name === n;
  const toggle = (kind: 'rule' | 'skill' | 'agent', n: string) => setEditing(isEditing(kind, n) ? null : { kind, name: n });
  const nameOk = SKILL_NAME_PATTERN.test(name) && !harnessState.skills.some((k) => k.name === name);

  const [model, setModel] = useState('');
  const agentNameOk = SKILL_NAME_PATTERN.test(name) && !harnessState.agents.some((a) => a.name === name);
  const clearForm = () => {
    setName('');
    setDescription('');
    setBody('');
    setModel('');
    setEditing(null);
  };
  const createAgent = () => {
    harness.createAgent({ name, description: description.trim(), content: body, model: model.trim() || undefined });
    clearForm();
  };

  const agentRow = (a: Agent) => (
    <section key={a.name} className="settings-block">
      <div className="row">
        <h3 className="plain">{a.name}</h3>
        {a.model && <span className="pill">{a.model}</span>}
        <span className="spacer" />
        <Button onClick={() => toggle('agent', a.name)}>{isEditing('agent', a.name) ? 'Fechar' : 'Editar'}</Button>
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
      {isEditing('agent', a.name) && (
        <FileEditor saved={a.content} onSave={(content) => harness.writeAgent(a.name, content)} onClose={() => setEditing(null)} />
      )}
    </section>
  );

  const createSkill = () => {
    harness.createSkill(name, description.trim(), body);
    setName('');
    setDescription('');
    setBody('');
    setEditing(null);
  };

  const ruleRow = (r: RuleFile) => {
    const readBy = RULE_FILES.find((x) => x.name === r.name)?.readBy;
    return (
      <section key={r.name} className="settings-block">
        <div className="row">
          <h3 className="plain">{r.name}</h3>
          <span className={`pill ${r.exists ? '' : 'off'}`}>{r.exists ? 'Existe' : 'Não existe'}</span>
          <span className="muted small">Lido por: {readBy}</span>
          <span className="spacer" />
          {r.name === 'CLAUDE.md' && !r.exists && agents?.exists && (
            <Button
              title="Cria um CLAUDE.md que só importa o AGENTS.md, para as regras ficarem num arquivo só"
              onClick={() => harness.writeRule('CLAUDE.md', '@AGENTS.md\n')}
            >
              Usar o AGENTS.md
            </Button>
          )}
          <Button onClick={() => toggle('rule', r.name)}>{isEditing('rule', r.name) ? 'Fechar' : r.exists ? 'Editar' : 'Criar'}</Button>
          {r.exists && (
            <DeleteButton
              title="Apagar o arquivo"
              question={`Apagar ${r.name}?`}
              message="O arquivo é removido da pasta do projeto."
              onConfirm={() => harness.deleteRule(r.name)}
            />
          )}
        </div>
        {isEditing('rule', r.name) && (
          <FileEditor saved={r.content} onSave={(content) => harness.writeRule(r.name, content)} onClose={() => setEditing(null)} />
        )}
      </section>
    );
  };

  /** o modo é gravado pelo caminho do SKILL.md, como o inventário o lista */
  const skillPath = (k: Skill) =>
    state.harness.inventory
      .find((t) => t.tool === tool.id)
      ?.items.find((i) => i.kind === 'skill' && i.scope === 'project' && i.location === k.path)?.path;
  const setMode = (skills: Skill[], mode: SkillMode) => {
    const paths = skills.map(skillPath).filter((p): p is string => !!p);
    if (paths.length) harness.setSkillMode(tool.id, paths, mode);
  };
  const automatic = harnessState.skills.filter((k) => k.enabled && k.mode === 'auto');

  const skillRow = (k: Skill) => (
    <section key={k.name} className={`settings-block ${k.enabled ? '' : 'rule off'}`}>
      <div className="row">
        <label className="switch" title={k.enabled ? 'Desligar: tira a skill do contexto das ferramentas de IA' : 'Ligar a skill'}>
          <input type="checkbox" checked={k.enabled} onChange={(e) => harness.setSkillEnabled(k.name, e.target.checked)} />
        </label>
        <h3 className="plain">{k.name}</h3>
        <span className={`pill ${k.enabled ? '' : 'off'}`}>{k.enabled ? 'Ligada' : 'Desligada'}</span>
        <span className="spacer" />
        {k.enabled && (
          <EnumSelect
            options={SKILL_MODE_OPTIONS}
            title={SKILL_MODES.find((m) => m.id === k.mode)!.hint}
            value={k.mode}
            onChange={(mode) => setMode([k], mode)}
          />
        )}
        <Button onClick={() => toggle('skill', k.name)}>{isEditing('skill', k.name) ? 'Fechar' : 'Editar'}</Button>
        <DeleteButton
          title="Apagar a skill"
          question={`Apagar a skill "${k.name}"?`}
          message="A pasta da skill é removida do projeto, com todos os arquivos dela."
          onConfirm={() => harness.deleteSkill(k.name)}
        />
      </div>
      <div className="muted small">{k.description || 'Sem descrição no frontmatter.'}</div>
      <div className="muted small">
        <code>{k.path}</code>
      </div>
      {isEditing('skill', k.name) && (
        <FileEditor saved={k.content} onSave={(content) => harness.writeSkill(k.name, content)} onClose={() => setEditing(null)} />
      )}
    </section>
  );

  return (
    <div>
      <h2>Harness de IA</h2>
      <p className="muted">
        Regras, skills e agentes que a ferramenta deste projeto lê na pasta do projeto, editáveis aqui. No fim da página está tudo que cada
        ferramenta carrega, incluindo o que vem da sua pasta de usuário e de plugins.
      </p>

      <h3>Ferramenta deste projeto</h3>
      <p className="muted small">
        O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é
        registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>Ferramenta</th>
            <th>Regras</th>
            <th>Skills</th>
            <th>MCP</th>
          </tr>
        </thead>
        <tbody>
          {AI_TOOLS.map((t) => (
            <tr key={t.id} className={t.id === tool.id ? '' : 'off'}>
              <td>
                <input type="radio" name="ai-tool" checked={t.id === tool.id} onChange={() => chooseTool(t.id)} />
              </td>
              <td>{t.label}</td>
              <td>
                <code>{t.rules}</code>
              </td>
              <td>
                <code>{t.skills}</code>
              </td>
              <td>
                <code>{t.mcp}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <Button variant="primary" onClick={() => ui.connectAI()}>
          Conectar o {tool.label} ao board (MCP)
        </Button>
        <span className="muted small">Registra o servidor do board em {tool.mcp}.</span>
      </div>

      <h3 className="section-head">Execução pela conversa e heartbeat</h3>
      <p className="muted small">
        O botão "Chamar IA" da conversa de um card roda o {tool.label} em segundo plano nesta pasta, sem ninguém aprovando cada passo. Aqui
        se define o que ele pode fazer nessas execuções. O {tool.label} precisa estar instalado e autenticado nesta máquina
        {state.board.aiTool === 'claude'
          ? '; o board é entregue a ele em cada execução, sem depender do botão acima'
          : ', e o servidor do board conectado (botão acima)'}
        .
      </p>
      {state.aiRunUnsupported ? (
        <p className="banner warn">{state.aiRunUnsupported}</p>
      ) : (
        <section className="settings-block runner-settings">
          <FieldRow label="O que a IA pode fazer">
            <EnumSelect
              options={RUNNER_PERMISSIONS}
              value={state.board.runner.permission}
              onChange={(permission) => settings.updateBoard({ runner: { permission } })}
            />
          </FieldRow>
          <p className={`small ${state.board.runner.permission === 'full' ? 'banner warn' : 'muted'}`}>
            {RUNNER_PERMISSIONS.find((p) => p.value === state.board.runner.permission)!.hint}
          </p>
          <FieldRow label="Tempo limite por execução">
            <div className="row">
              <NumberField
                min={TIMEOUT_RANGE.min}
                max={TIMEOUT_RANGE.max}
                value={state.board.runner.timeoutMinutes}
                onCommit={(timeoutMinutes) => settings.updateBoard({ runner: { timeoutMinutes } })}
              />
              <span className="muted">minutos</span>
            </div>
          </FieldRow>
          <h4>Heartbeat</h4>
          <p className="muted small">
            Com o heartbeat ligado e o board aberto nesta pasta (no editor ou pelo comando faz-ai), o board chama o {tool.label} sozinho a
            cada intervalo: ele avança os cards aprovados, responde às mensagens pendentes e trabalha nos cards prontos, uma história por
            vez. Sem pendência, nada é executado.
          </p>
          <label className="switch">
            <input
              type="checkbox"
              checked={state.board.runner.heartbeat}
              onChange={(e) => settings.updateBoard({ runner: { heartbeat: e.target.checked } })}
            />
            Heartbeat ligado
          </label>
          <FieldRow label="Intervalo">
            <div className="row">
              <NumberField
                min={HEARTBEAT_RANGE.min}
                max={HEARTBEAT_RANGE.max}
                value={state.board.runner.heartbeatMinutes}
                onCommit={(heartbeatMinutes) => settings.updateBoard({ runner: { heartbeatMinutes } })}
              />
              <span className="muted">minutos</span>
              <Button title="Começa uma rodada agora, mesmo com o heartbeat desligado" onClick={() => ai.runHeartbeat()}>
                Rodar agora
              </Button>
            </div>
          </FieldRow>
        </section>
      )}

      <h3 className="section-head">Regras do projeto</h3>
      <p className="muted small">Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.</p>
      <div className="stack">{rules.map(ruleRow)}</div>

      <div className="row section-head">
        <h3>Skills</h3>
        <span className="spacer" />
        {!harnessState.skills.some((k) => k.name === FLOW_SKILL_NAME) && (
          <Button
            title="Cria a skill que ensina a IA a conduzir os cards pelo fluxo do board: fases, documentos, revisão e pendências"
            onClick={() => harness.installFlowSkill()}
          >
            Instalar skill do fluxo
          </Button>
        )}
        <Button variant="primary" onClick={() => setEditing(editing?.kind === 'newSkill' ? null : { kind: 'newSkill' })}>
          Nova skill
        </Button>
      </div>
      <p className="muted small">
        Skills do {tool.label} em <code>{tool.skills}</code>. Todas viram opções do campo "Skills" dos cards, e um card que indica uma skill
        entrega à IA o caminho do arquivo. Por isso uma skill não precisa ficar à vista da IA para ser usada:
      </p>
      <ul className="muted small">
        <li>
          <b>Automática</b>: a IA vê a descrição em toda sessão e decide quando usar.
        </li>
        <li>
          <b>Só quando indicada</b>: a IA não a invoca sozinha; vale quando um card a indica ou quando é chamada pelo nome.
        </li>
        <li>
          <b>Desligada</b>: movida para <code>{tool.skills}-disabled</code>; a ferramenta não a enxerga, mas um card ainda pode indicá-la.
        </li>
      </ul>
      {automatic.length > 1 && (
        <div className="row">
          <span className="muted small">{automatic.length} skills automáticas no projeto.</span>
          <Button
            variant="ghost"
            size="small"
            title="A IA deixa de invocar essas skills sozinha; elas continuam valendo nos cards que as indicam"
            onClick={() => setMode(automatic, 'manual')}
          >
            Deixar todas só quando indicadas
          </Button>
        </div>
      )}

      {editing?.kind === 'newSkill' && (
        <section className="settings-block">
          <FieldRow label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="revisar-spec"
            />
          </FieldRow>
          <FieldRow label="Descrição (quando usar)">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Use ao revisar uma Spec antes de passar para o Plan"
            />
          </FieldRow>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Instruções da skill, em markdown"
            spellCheck={false}
          />
          <div className="row">
            <Button variant="primary" disabled={!nameOk || !description.trim()} onClick={createSkill}>
              Criar skill
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            {name && !nameOk && <span className="muted small">Nome inválido ou já usado.</span>}
          </div>
        </section>
      )}

      <div className="stack">
        {harnessState.skills.map(skillRow)}
        {harnessState.skills.length === 0 && (
          <p className="muted">
            Nenhuma skill em <code>{tool.skills}</code> ainda.
          </p>
        )}
      </div>

      <div className="row section-head">
        <h3>Agentes</h3>
        <span className="spacer" />
        {tool.agents && (
          <Button variant="primary" onClick={() => setEditing(editing?.kind === 'newAgent' ? null : { kind: 'newAgent' })}>
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
          {editing?.kind === 'newAgent' && (
            <section className="settings-block">
              <FieldRow label="Nome">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="revisor-de-spec"
                />
              </FieldRow>
              <FieldRow label="Descrição (quando delegar)">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Revisa uma Spec e aponta lacunas antes do Plan"
                />
              </FieldRow>
              {tool.agents.modelField && (
                <FieldRow label="Modelo (opcional)">
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="vazio = o modelo da sessão" />
                </FieldRow>
              )}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Instruções do agente"
                spellCheck={false}
              />
              <div className="row">
                <Button variant="primary" disabled={!agentNameOk || !description.trim()} onClick={createAgent}>
                  Criar agente
                </Button>
                <Button variant="ghost" onClick={clearForm}>
                  Cancelar
                </Button>
                {name && !agentNameOk && <span className="muted small">Nome inválido ou já usado.</span>}
              </div>
            </section>
          )}
          <div className="stack">
            {harnessState.agents.map(agentRow)}
            {harnessState.agents.length === 0 && (
              <p className="muted">
                Nenhum agente em <code>{tool.agents.dir}</code> ainda.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="muted small">O {tool.label} não define agentes em arquivos do projeto.</p>
      )}

      <HarnessInventory />
    </div>
  );
}
