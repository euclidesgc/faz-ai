import { useEffect, useState } from 'react';
import { RULE_FILES, SKILL_NAME_PATTERN, type RuleFile, type Skill } from '../../../shared/harness';
import { useBoardStore } from '../../store/boardStore';

type Editing = { kind: 'rule'; name: string } | { kind: 'skill'; name: string } | { kind: 'newSkill' } | null;

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
        <button className="primary" disabled={!dirty} onClick={() => onSave(text)}>Salvar</button>
        <button className="ghost" onClick={onClose}>{dirty ? 'Descartar' : 'Fechar'}</button>
        {dirty && <span className="muted small">Alterações não salvas</span>}
      </div>
    </div>
  );
}

export function HarnessSettings() {
  const harness = useBoardStore((s) => s.state)!.harness;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');

  const isEditing = (kind: 'rule' | 'skill', n: string) => editing !== null && editing.kind === kind && editing.name === n;
  const toggle = (kind: 'rule' | 'skill', n: string) => setEditing(isEditing(kind, n) ? null : { kind, name: n });
  const nameOk = SKILL_NAME_PATTERN.test(name) && !harness.skills.some((k) => k.name === name);

  const createSkill = () => {
    send({ type: 'harness.skill.create', name, description: description.trim(), content: body });
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
          <button onClick={() => toggle('rule', r.name)}>{isEditing('rule', r.name) ? 'Fechar' : r.exists ? 'Editar' : 'Criar'}</button>
          {r.exists && (
            <button
              className="icon danger"
              title="Apagar o arquivo"
              onClick={() => ask({ title: `Apagar ${r.name}?`, message: 'O arquivo é removido da pasta do projeto.', confirmLabel: 'Apagar', danger: true, onConfirm: () => send({ type: 'harness.rule.delete', name: r.name }) })}
            >🗑</button>
          )}
        </div>
        {isEditing('rule', r.name) && <FileEditor saved={r.content} onSave={(content) => send({ type: 'harness.rule.write', name: r.name, content })} onClose={() => setEditing(null)} />}
      </section>
    );
  };

  const skillRow = (k: Skill) => (
    <section key={k.name} className={`settings-block ${k.enabled ? '' : 'rule off'}`}>
      <div className="row">
        <label className="switch" title={k.enabled ? 'Desligar: tira a skill do contexto das ferramentas de IA' : 'Ligar a skill'}>
          <input type="checkbox" checked={k.enabled} onChange={(e) => send({ type: 'harness.skill.setEnabled', name: k.name, enabled: e.target.checked })} />
        </label>
        <h3 className="plain">{k.name}</h3>
        <span className={`pill ${k.enabled ? '' : 'off'}`}>{k.enabled ? 'Ligada' : 'Desligada'}</span>
        <span className="spacer" />
        <button onClick={() => toggle('skill', k.name)}>{isEditing('skill', k.name) ? 'Fechar' : 'Editar'}</button>
        <button
          className="icon danger"
          title="Apagar a skill"
          onClick={() => ask({ title: `Apagar a skill "${k.name}"?`, message: 'A pasta da skill é removida do projeto, com todos os arquivos dela.', confirmLabel: 'Apagar', danger: true, onConfirm: () => send({ type: 'harness.skill.delete', name: k.name }) })}
        >🗑</button>
      </div>
      <div className="muted small">{k.description || 'Sem descrição no frontmatter.'}</div>
      <div className="muted small"><code>{k.path}</code></div>
      {isEditing('skill', k.name) && <FileEditor saved={k.content} onSave={(content) => send({ type: 'harness.skill.write', name: k.name, content })} onClose={() => setEditing(null)} />}
    </section>
  );

  return (
    <div>
      <h2>Harness de IA</h2>
      <p className="muted">
        Regras e skills que as ferramentas de IA leem neste projeto. Tudo aqui são arquivos da pasta do projeto: o board só os edita.
      </p>

      <h3>Regras do projeto</h3>
      <p className="muted small">Instruções carregadas em toda sessão de IA. Quanto mais curtas, menos contexto consomem.</p>
      <div className="stack">{harness.rules.map(ruleRow)}</div>

      <div className="row section-head">
        <h3>Skills</h3>
        <span className="spacer" />
        <button className="primary" onClick={() => setEditing(editing?.kind === 'newSkill' ? null : { kind: 'newSkill' })}>Nova skill</button>
      </div>
      <p className="muted small">
        Skills ligadas ficam em <code>.claude/skills</code> e viram opções do campo "Skills" dos cards. Desligar move a skill para
        <code> .claude/skills-disabled</code>: ela sai do contexto das ferramentas, mas o conteúdo é preservado.
      </p>

      {editing?.kind === 'newSkill' && (
        <section className="settings-block">
          <label className="field-row">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="revisar-spec" />
          </label>
          <label className="field-row">
            <span>Descrição (quando usar)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use ao revisar uma Spec antes de passar para o Plan" />
          </label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="Instruções da skill, em markdown" spellCheck={false} />
          <div className="row">
            <button className="primary" disabled={!nameOk || !description.trim()} onClick={createSkill}>Criar skill</button>
            <button className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
            {name && !nameOk && <span className="muted small">Nome inválido ou já usado.</span>}
          </div>
        </section>
      )}

      <div className="stack">
        {harness.skills.map(skillRow)}
        {harness.skills.length === 0 && <p className="muted">Nenhuma skill neste projeto ainda.</p>}
      </div>
    </div>
  );
}
