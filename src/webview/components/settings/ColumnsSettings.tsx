import { useState } from 'react';
import type { ColumnCategory } from '../../../shared/model';
import { archiveKey } from '../../../shared/filters';
import { columnsOf, useBoardStore } from '../../store/boardStore';

export function ColumnsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const resetCollapsed = useBoardStore((s) => s.resetCollapsed);
  const [newName, setNewName] = useState<Record<string, string>>({});

  return (
    <div>
      <h2>Workflows e colunas</h2>
      <p className="muted">A linha de cima recebe histórias, bugs, retrabalho e débitos. A linha de baixo recebe as sub-tarefas de cada história. Uma história só pode entrar numa coluna de conclusão quando não tem sub-tarefas em aberto. "Começa colapsada" é o padrão ao abrir o board; lá, cada linha e coluna abre e fecha com um clique, e essa escolha fica lembrada.</p>
      {state.workflows.map((wf) => {
        const cols = columnsOf(state, wf.id);
        return (
          <section key={wf.id} className="settings-block">
            <div className="row">
              <input className="h3-input" defaultValue={wf.name} onBlur={(e) => e.target.value.trim() && e.target.value !== wf.name && send({ type: 'settings.workflow.update', workflowId: wf.id, patch: { name: e.target.value.trim() } })} />
              <span className="muted">{wf.kind === 'parent' ? 'linha de cima' : 'linha de baixo'}</span>
              <span className="spacer" />
              <label className="switch" title="Como a linha aparece ao abrir o board; no board ela abre e fecha pelo cabeçalho">
                <input type="checkbox" checked={wf.collapsed} onChange={(e) => { send({ type: 'settings.workflow.update', workflowId: wf.id, patch: { collapsed: e.target.checked } }); resetCollapsed(wf.id); }} />
                Linha começa colapsada
              </label>
            </div>
            <table className="table">
              <thead><tr><th>Coluna</th><th>Representa</th><th>Começa colapsada</th><th>Ordem</th><th></th></tr></thead>
              <tbody>
                {cols.map((c, i) => (
                  <tr key={c.id}>
                    <td><input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && send({ type: 'settings.column.update', columnId: c.id, patch: { name: e.target.value.trim() } })} /></td>
                    <td>
                      <select value={c.category} onChange={(e) => send({ type: 'settings.column.update', columnId: c.id, patch: { category: e.target.value as ColumnCategory } })}>
                        <option value="open">Trabalho em aberto</option>
                        <option value="done">Conclusão</option>
                        <option value="cancelled">Cancelamento</option>
                      </select>
                    </td>
                    <td><input type="checkbox" checked={c.collapsed} onChange={(e) => { send({ type: 'settings.column.update', columnId: c.id, patch: { collapsed: e.target.checked } }); resetCollapsed(c.id); }} /></td>
                    <td>
                      <button className="icon" disabled={i === 0} onClick={() => send({ type: 'settings.column.update', columnId: c.id, patch: { position: i - 1 } })}>←</button>
                      <button className="icon" disabled={i === cols.length - 1} onClick={() => send({ type: 'settings.column.update', columnId: c.id, patch: { position: i + 1 } })}>→</button>
                    </td>
                    <td>
                      <button
                        className="icon danger"
                        disabled={cols.length <= 1}
                        onClick={() => {
                          const others = cols.filter((x) => x.id !== c.id);
                          const n = state.cards.filter((k) => k.columnId === c.id).length;
                          ask({
                            title: `Excluir a coluna "${c.name}"?`,
                            message: n ? `${n} card(s) serão movidos para a coluna escolhida.` : 'A coluna está vazia.',
                            confirmLabel: 'Excluir coluna',
                            danger: true,
                            choices: n ? { label: 'Mover cards para', options: others.map((x) => ({ value: x.id, label: x.name })) } : undefined,
                            onConfirm: (dest) => send({ type: 'settings.column.delete', columnId: c.id, moveCardsTo: dest ?? others[0]!.id }),
                          });
                        }}
                      >🗑</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="muted">Arquivados</td>
                  <td className="muted">Cards arquivados desta linha</td>
                  <td><input type="checkbox" checked={wf.archiveCollapsed} onChange={(e) => { send({ type: 'settings.workflow.update', workflowId: wf.id, patch: { archiveCollapsed: e.target.checked } }); resetCollapsed(archiveKey(wf.id)); }} /></td>
                  <td></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="row">
              <input placeholder="Nova coluna" value={newName[wf.id] ?? ''} onChange={(e) => setNewName({ ...newName, [wf.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && newName[wf.id]?.trim()) { send({ type: 'settings.column.create', workflowId: wf.id, name: newName[wf.id]!.trim() }); setNewName({ ...newName, [wf.id]: '' }); } }} />
              <button className="primary" disabled={!newName[wf.id]?.trim()} onClick={() => { send({ type: 'settings.column.create', workflowId: wf.id, name: newName[wf.id]!.trim() }); setNewName({ ...newName, [wf.id]: '' }); }}>Adicionar</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
