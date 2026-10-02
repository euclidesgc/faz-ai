import { Fragment, useState } from 'react';
import type { Column, ColumnCategory } from '../../../shared/model';
import { PHASE_DEFAULTS } from '../../../shared/phaseDefaults';
import { archiveKey } from '../../../shared/filters';
import { columnsOf, useBoardStore } from '../../store/boardStore';
import { MarkdownEditor } from '../MarkdownEditor';

/** A fase de uma coluna: o que a IA faz quando o card entra nela e o documento que a fase produz. */
function PhaseEditor({ column }: { column: Column }) {
  const send = useBoardStore((s) => s.send);
  const [template, setTemplate] = useState(column.artifactTemplate);
  const patch = (p: { aiInstruction?: string; artifactName?: string; artifactTemplate?: string }) => send({ type: 'settings.column.update', columnId: column.id, patch: p });
  const preset = PHASE_DEFAULTS[column.name];
  const isDefault = preset && preset.instruction === column.aiInstruction && preset.artifactName === column.artifactName && preset.artifactTemplate === column.artifactTemplate;

  return (
    <div className="phase-editor">
      <label className="field-col">
        <span>Instrução para a IA <small className="muted">o que ela faz quando um card entra em "{column.name}"</small></span>
        <textarea key={column.aiInstruction} rows={5} defaultValue={column.aiInstruction} placeholder="Ex.: escreva o documento de requisitos a partir da conversa do card…" onBlur={(e) => e.target.value !== column.aiInstruction && patch({ aiInstruction: e.target.value })} />
      </label>
      <label className="field-col">
        <span>Documento da fase <small className="muted">nome do arquivo anexado à história; vazio se a fase não gera documento</small></span>
        <input key={column.artifactName} defaultValue={column.artifactName} placeholder="Ex.: PRD.md" onBlur={(e) => e.target.value.trim() !== column.artifactName && patch({ artifactName: e.target.value.trim() })} />
      </label>
      <div className="field-col">
        <span>Modelo do documento <small className="muted">a IA preenche este modelo ao gerar o documento</small></span>
        <MarkdownEditor key={column.artifactTemplate} minRows={8} value={template} onChange={setTemplate} onCommit={() => template !== column.artifactTemplate && patch({ artifactTemplate: template })} placeholder="Markdown com as seções do documento." />
      </div>
      {preset && (
        <div className="row end">
          <button className="ghost small" disabled={isDefault} onClick={() => patch({ aiInstruction: preset.instruction, artifactName: preset.artifactName, artifactTemplate: preset.artifactTemplate })}>Restaurar o padrão desta fase</button>
        </div>
      )}
    </div>
  );
}

export function ColumnsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const resetCollapsed = useBoardStore((s) => s.resetCollapsed);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [phaseOpen, setPhaseOpen] = useState<string | null>(null);

  return (
    <div>
      <h2>Workflows e colunas</h2>
      <p className="muted">A linha de cima recebe histórias, bugs, retrabalho e débitos. A linha de baixo recebe as sub-tarefas de cada história. Uma história só pode entrar numa coluna de conclusão quando não tem sub-tarefas em aberto. "Começa colapsada" é o padrão ao abrir o board; lá, cada linha e coluna abre e fecha com um clique, e essa escolha fica lembrada.</p>
      <p className="muted">"IA atua" marca as colunas em que a IA trabalha: ao entrar nelas o card fica Pronto. "Exige aprovação" é o ponto de revisão: a IA termina, pede a revisão e só avança o card depois que você aprova. Em "Fase" ficam a instrução da IA para a coluna e o modelo do documento que ela produz (PRD, Spec…).</p>
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
              <thead><tr><th>Coluna</th><th>Representa</th><th>IA atua</th><th>Exige aprovação</th><th>Fase</th><th>Começa colapsada</th><th>Ordem</th><th></th></tr></thead>
              <tbody>
                {cols.map((c, i) => (
                  <Fragment key={c.id}>
                  <tr>
                    <td><input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && send({ type: 'settings.column.update', columnId: c.id, patch: { name: e.target.value.trim() } })} /></td>
                    <td>
                      <select value={c.category} onChange={(e) => send({ type: 'settings.column.update', columnId: c.id, patch: { category: e.target.value as ColumnCategory } })}>
                        <option value="open">Trabalho em aberto</option>
                        <option value="done">Conclusão</option>
                        <option value="cancelled">Cancelamento</option>
                      </select>
                    </td>
                    <td><input type="checkbox" disabled={c.category !== 'open'} checked={c.aiActive} onChange={(e) => send({ type: 'settings.column.update', columnId: c.id, patch: { aiActive: e.target.checked } })} /></td>
                    <td><input type="checkbox" disabled={c.category !== 'open'} checked={c.requiresApproval} onChange={(e) => send({ type: 'settings.column.update', columnId: c.id, patch: { requiresApproval: e.target.checked } })} /></td>
                    <td>
                      <button className={`ghost small ${phaseOpen === c.id ? 'on' : ''}`} disabled={c.category !== 'open'} title="Instrução para a IA e modelo do documento desta fase" onClick={() => setPhaseOpen(phaseOpen === c.id ? null : c.id)}>
                        {c.artifactName || (c.aiInstruction ? 'Instrução' : 'Definir')} ▾
                      </button>
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
                  {phaseOpen === c.id && <tr><td colSpan={8}><PhaseEditor column={c} /></td></tr>}
                  </Fragment>
                ))}
                <tr>
                  <td className="muted">Arquivados</td>
                  <td className="muted">Cards arquivados desta linha</td>
                  <td></td>
                  <td></td>
                  <td></td>
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
