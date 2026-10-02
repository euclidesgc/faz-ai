import { Fragment, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

/** Linha da tabela que pode ser arrastada pela alça; com a alça em foco, ↑ e ↓ movem uma posição. */
function SortableRow({ id, name, onStep, children }: { id: string; name: string; onStep: (delta: number) => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr ref={setNodeRef} className={isDragging ? 'dragging' : ''} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <td className="drag-cell">
        <button
          className="icon drag-handle"
          title={`Arraste para mudar a posição de "${name}" (ou use ↑ e ↓)`}
          {...attributes}
          {...listeners}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            onStep(e.key === 'ArrowUp' ? -1 : 1);
          }}
        >⠿</button>
      </td>
      {children}
    </tr>
  );
}

const START = '__start';

export function ColumnsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const resetCollapsed = useBoardStore((s) => s.resetCollapsed);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [phaseOpen, setPhaseOpen] = useState<string | null>(null);
  /** coluna depois da qual a nova entra, por workflow; sem escolha, vale o padrão */
  const [newAfter, setNewAfter] = useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const moveTo = (columnId: string, position: number) => send({ type: 'settings.column.update', columnId, patch: { position } });

  return (
    <div>
      <h2>Workflows e colunas</h2>
      <p className="muted">A linha de cima recebe histórias, bugs, retrabalho e débitos. A linha de baixo recebe as sub-tarefas de cada história. Uma história só pode entrar numa coluna de conclusão quando não tem sub-tarefas em aberto. "Começa colapsada" é o padrão ao abrir o board; lá, cada linha e coluna abre e fecha com um clique, e essa escolha fica lembrada. Para mudar a ordem das colunas, arraste a linha pela alça ⠿.</p>
      <p className="muted">"IA atua" marca as colunas em que a IA trabalha: ao entrar nelas o card fica Pronto. "Exige aprovação" é o ponto de revisão: a IA termina, pede a revisão e só avança o card depois que você aprova. Em "Fase" ficam a instrução da IA para a coluna e o modelo do documento que ela produz (PRD, Spec…).</p>
      {state.workflows.map((wf) => {
        const cols = columnsOf(state, wf.id);
        const firstTerminal = cols.findIndex((c) => c.category !== 'open');
        // padrão: antes da primeira coluna de conclusão, que é onde uma fase nova costuma entrar
        const defaultAfter = (firstTerminal === -1 ? cols[cols.length - 1] : cols[firstTerminal - 1])?.id ?? START;
        const after = newAfter[wf.id] && (newAfter[wf.id] === START || cols.some((c) => c.id === newAfter[wf.id])) ? newAfter[wf.id]! : defaultAfter;
        const create = () => {
          const name = newName[wf.id]?.trim();
          if (!name) return;
          send({ type: 'settings.column.create', workflowId: wf.id, name, position: after === START ? 0 : cols.findIndex((c) => c.id === after) + 1 });
          setNewName({ ...newName, [wf.id]: '' });
          setNewAfter({ ...newAfter, [wf.id]: '' });
        };
        const onDragEnd = (e: DragEndEvent) => {
          const to = cols.findIndex((c) => c.id === e.over?.id);
          if (e.over && e.active.id !== e.over.id && to !== -1) moveTo(String(e.active.id), to);
        };
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <table className="table">
              <thead><tr><th></th><th>Coluna</th><th>Representa</th><th>IA atua</th><th>Exige aprovação</th><th>Fase</th><th>Começa colapsada</th><th></th></tr></thead>
              <tbody>
                <SortableContext items={cols.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {cols.map((c, i) => (
                  <Fragment key={c.id}>
                  <SortableRow id={c.id} name={c.name} onStep={(d) => i + d >= 0 && i + d < cols.length && moveTo(c.id, i + d)}>
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
                  </SortableRow>
                  {phaseOpen === c.id && <tr><td colSpan={8}><PhaseEditor column={c} /></td></tr>}
                  </Fragment>
                ))}
                </SortableContext>
                <tr>
                  <td></td>
                  <td className="muted">Arquivados</td>
                  <td className="muted">Cards arquivados desta linha</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td><input type="checkbox" checked={wf.archiveCollapsed} onChange={(e) => { send({ type: 'settings.workflow.update', workflowId: wf.id, patch: { archiveCollapsed: e.target.checked } }); resetCollapsed(archiveKey(wf.id)); }} /></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            </DndContext>
            <div className="row">
              <input placeholder="Nova coluna" value={newName[wf.id] ?? ''} onChange={(e) => setNewName({ ...newName, [wf.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} />
              <select title="Onde a nova coluna entra" value={after} onChange={(e) => setNewAfter({ ...newAfter, [wf.id]: e.target.value })}>
                <option value={START}>No início</option>
                {cols.map((c) => <option key={c.id} value={c.id}>Depois de {c.name}</option>)}
              </select>
              <button className="primary" disabled={!newName[wf.id]?.trim()} onClick={create}>Adicionar</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
