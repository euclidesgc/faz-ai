import { useEffect, useState } from 'react';
import { AI_TOOLS, HARNESS_KINDS, HARNESS_SCOPES, type AiTool, type HarnessItem } from '../../../shared/harness';
import { useBoardStore } from '../../store/boardStore';

/** Tudo que cada ferramenta de IA carrega: por tipo de componente e por escopo (projeto, global, plugins). */
export function HarnessInventory() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const [tool, setTool] = useState<AiTool>(state.board.aiTool);
  // a pasta do usuário não é vigiada: relê ao abrir a tela
  useEffect(() => send({ type: 'harness.refresh' }), [send]);

  const inventory = state.harness.inventory;
  const current = inventory.find((t) => t.tool === tool);
  const items = current?.items ?? [];
  const label = (id: AiTool) => AI_TOOLS.find((t) => t.id === id)!.label;
  const missing = inventory.filter((t) => !t.installed && t.items.length === 0).map((t) => label(t.tool));

  const row = (i: HarnessItem) => (
    <tr key={`${i.path}|${i.name}`}>
      <td>{i.name}{i.plugin && <span className="pill off">{i.plugin}</span>}</td>
      <td className="muted small">{i.description || '—'}</td>
      <td className="muted small"><code>{i.location}</code></td>
      <td><button className="ghost small" title="Abre o arquivo no editor" onClick={() => send({ type: 'harness.item.open', path: i.path })}>Abrir</button></td>
    </tr>
  );

  return (
    <div className="harness-inventory">
      <div className="row section-head">
        <h3>Tudo que cada ferramenta carrega</h3>
        <span className="spacer" />
        <button title="Relê as pastas do projeto e do usuário" onClick={() => send({ type: 'harness.refresh' })}>Atualizar</button>
      </div>
      <p className="muted small">
        O que cada ferramenta de IA lê neste projeto e na sua pasta de usuário, separado por escopo. <b>Projeto</b> vale só aqui; <b>Global</b> vale
        em todos os seus projetos; <b>Plugins</b> vem de pacotes instalados. "Abrir" mostra o arquivo no editor.
      </p>
      <div className="tabs">
        {inventory.map((t) => (
          <button key={t.tool} className={t.tool === tool ? 'active' : ''} onClick={() => setTool(t.tool)}>
            {label(t.tool)}
            {t.tool === state.board.aiTool && <span className="pill">deste projeto</span>}
            {!t.installed && <span className="pill off">não encontrada</span>}
          </button>
        ))}
      </div>
      {missing.length > 0 && <p className="muted small">Sem sinal de instalação nesta máquina: {missing.join(', ')}.</p>}
      {HARNESS_KINDS.map((k) => {
        const ofKind = items.filter((i) => i.kind === k.id);
        return (
          <section key={k.id} className="settings-block">
            <div className="row">
              <h3 className="plain">{k.label}</h3>
              <span className="pill off">{ofKind.length}</span>
              <span className="muted small">{k.hint}</span>
            </div>
            {ofKind.length === 0 && <p className="muted small">Nada encontrado para o {label(tool)}.</p>}
            {HARNESS_SCOPES.map((s) => {
              const group = ofKind.filter((i) => i.scope === s.id);
              if (!group.length) return null;
              return (
                <details key={s.id} open={s.id !== 'plugin' || group.length <= 12}>
                  <summary title={s.hint}>{s.label} <span className="muted small">({group.length})</span></summary>
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
