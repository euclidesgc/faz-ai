import { useEffect, useRef, useState } from 'react';
import { cardRef, type FieldValue } from '../../shared/model';
import { MODEL_EFFORT_LABEL, modelLabel, suggestModel } from '../../shared/models';
import { cardsIn, childrenOf, columnsOf, fieldsForType, useBoardStore, valueOf } from '../store/boardStore';
import { requestArchive, requestMove, requestTrash } from '../store/actions';
import { AttachmentsTab } from './AttachmentsTab';
import { CommentsTab } from './CommentsTab';
import { FieldEditor, ModelEditor } from './FieldRenderer';
import { Menu } from './Menu';
import { MarkdownEditor, renderMarkdown } from './MarkdownEditor';

type Tab = 'details' | 'comments' | 'attachments';

export function CardDrawer({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const openCard = useBoardStore((s) => s.openCard);
  const selectParent = useBoardStore((s) => s.selectParent);
  const dialogOpen = useBoardStore((s) => s.dialog !== null);

  const card = state.cards.find((c) => c.id === cardId);
  const [tab, setTab] = useState<Tab>('details');
  const [title, setTitle] = useState(card?.title ?? '');
  const [desc, setDesc] = useState(card?.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newSub, setNewSub] = useState('');

  // a descrição só é ressincronizada ao trocar de card, para não sobrescrever o que está sendo digitado
  const latest = useRef({ desc, saved: card?.description ?? '', cardId });
  latest.current = { desc, saved: card?.description ?? '', cardId };

  useEffect(() => {
    setTitle(card?.title ?? '');
  }, [card?.id, card?.title]);

  useEffect(() => {
    setDesc(card?.description ?? '');
    setEditingDesc(false);
    setTab('details');
    // salva o que ficou pendente ao trocar de card ou fechar o drawer
    return () => {
      const l = latest.current;
      if (l.desc !== l.saved) send({ type: 'card.update', cardId: l.cardId, patch: { description: l.desc } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openCard(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCard, dialogOpen]);

  if (!card) return null;

  const workflow = state.workflows.find((w) => w.id === card.workflowId)!;
  const columns = columnsOf(state, workflow.id);
  const types = state.cardTypes.filter((t) => t.defaultWorkflowId === workflow.id);
  const fields = fieldsForType(state, card.typeId);
  const suggested = suggestModel(state, card);
  const checklist = state.checklistItems.filter((i) => i.cardId === card.id).sort((a, b) => a.position - b.position);
  const children = workflow.kind === 'parent' ? childrenOf(state, card.id) : [];
  const childWf = state.workflows.find((w) => w.kind === 'child');
  const childFirstCol = childWf ? columnsOf(state, childWf.id)[0] : undefined;
  const subType = childWf ? state.cardTypes.find((t) => t.defaultWorkflowId === childWf.id) : undefined;
  const parent = card.parentId ? state.cards.find((c) => c.id === card.parentId) : undefined;
  const commentCount = state.comments.filter((c) => c.cardId === card.id).length;
  const attachmentCount = state.attachments.filter((a) => a.cardId === card.id).length;
  const trashed = card.deletedAt !== null;
  const archived = card.archivedAt !== null;

  const saveTitle = () => title.trim() && title !== card.title && send({ type: 'card.update', cardId, patch: { title: title.trim() } });
  const saveDesc = () => desc !== card.description && send({ type: 'card.update', cardId, patch: { description: desc } });

  const addSub = () => {
    if (!newSub.trim() || !childFirstCol || !subType) return;
    send({ type: 'card.create', typeId: subType.id, columnId: childFirstCol.id, parentId: card.id, title: newSub.trim() });
    setNewSub('');
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={() => openCard(null)} />
      <aside className="drawer">
        <header className="drawer-header">
          <select value={card.typeId} onChange={(e) => send({ type: 'card.update', cardId, patch: { typeId: e.target.value } })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select disabled={trashed || archived} value={card.columnId} onChange={(e) => requestMove(cardId, e.target.value, cardsIn(state, e.target.value).length)}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="spacer" />
          {trashed && <button className="primary" onClick={() => send({ type: 'card.restore', cardId })}>Restaurar</button>}
          {/* arquivar e excluir ficam num menu, longe do botão de fechar, para não serem clicados por engano */}
          {!trashed && (
            <Menu
              title="Ações do card"
              items={[
                archived
                  ? { label: 'Desarquivar', onClick: () => send({ type: 'card.unarchive', cardId }) }
                  : { label: 'Arquivar', onClick: () => requestArchive(cardId, () => openCard(null)) },
                'sep',
                { label: 'Mover para a lixeira', danger: true, onClick: () => requestTrash(cardId, () => openCard(null)) },
              ]}
            >
              Ações ▾
            </Menu>
          )}
          <span className="drawer-divider" />
          <button className="icon drawer-close" title="Fechar (Esc)" aria-label="Fechar" onClick={() => openCard(null)}>✕</button>
        </header>

        {trashed && <div className="banner warn">Este card está na lixeira.</div>}
        {!trashed && archived && <div className="banner warn">Este card está arquivado.</div>}

        {parent && (
          <div className="drawer-parent">
            Sub-tarefa de <a onClick={() => openCard(parent.id)}>{cardRef(parent)} {parent.title}</a>
          </div>
        )}

        <div className="drawer-id" title="ID do card">{cardRef(card)}</div>
        <input className="drawer-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />

        <nav className="tabs">
          <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Detalhes</button>
          <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>Comentários{commentCount > 0 && ` (${commentCount})`}</button>
          <button className={tab === 'attachments' ? 'active' : ''} onClick={() => setTab('attachments')}>Anexos{attachmentCount > 0 && ` (${attachmentCount})`}</button>
        </nav>

        {tab === 'comments' && <CommentsTab cardId={card.id} />}
        {tab === 'attachments' && <AttachmentsTab cardId={card.id} />}

        {tab === 'details' && (
          <>
            {fields.length > 0 && (
              <section className="drawer-section">
                <h3>Campos</h3>
                <div className="fields-grid">
                  {fields.map((f) => {
                    const value = valueOf(state, card.id, f.id);
                    const set = (v: FieldValue) => send({ type: 'field.setValue', cardId, fieldId: f.id, value: v });
                    if (f.kind !== 'model') {
                      return (
                        <label key={f.id} className="field-row">
                          <span>{f.name}</span>
                          <FieldEditor field={f} value={value} onChange={set} />
                        </label>
                      );
                    }
                    // modelo e esforço do modelo em linhas separadas, para não confundir com o esforço da atividade
                    return (
                      <div key={f.id} className="model-rows">
                        <label className="field-row">
                          <span>{f.name}</span>
                          <ModelEditor part="model" value={value} onChange={set} />
                        </label>
                        <label className="field-row">
                          <span>{MODEL_EFFORT_LABEL}</span>
                          <ModelEditor part="effort" value={value} onChange={set} />
                        </label>
                        {suggested && suggested !== value && (
                          <div className="field-row">
                            <span />
                            <span className="muted small suggestion">
                              Sugerido pelas regras: {modelLabel(state.board.modelCatalog, suggested, true)}{' '}
                              <a onClick={(e) => { e.preventDefault(); set(suggested); }}>Usar</a>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="drawer-section">
              <div className="section-head">
                <h3>Descrição</h3>
                {!editingDesc && <button className="ghost small" onClick={() => setEditingDesc(true)}>Editar</button>}
                {editingDesc && <button className="ghost small" onClick={() => { saveDesc(); setEditingDesc(false); }}>Concluir</button>}
              </div>
              {editingDesc ? (
                <MarkdownEditor autoFocus minRows={12} value={desc} onChange={setDesc} onCommit={saveDesc} placeholder="Descreva o problema, o contexto e o critério de aceite. Markdown suportado." />
              ) : (
                <div className="markdown clickable" onClick={(e) => (e.target as HTMLElement).tagName !== 'A' && setEditingDesc(true)} dangerouslySetInnerHTML={{ __html: desc.trim() ? renderMarkdown(desc) : '<p class="muted">Clique para adicionar uma descrição…</p>' }} />
              )}
            </section>

            <section className="drawer-section">
              <h3>Checklist {checklist.length > 0 && <small>{checklist.filter((i) => i.done).length}/{checklist.length}</small>}</h3>
              <ul className="checklist">
                {checklist.map((item) => (
                  <li key={item.id} className={item.done ? 'done' : ''}>
                    <input type="checkbox" checked={item.done} onChange={(e) => send({ type: 'checklist.update', itemId: item.id, patch: { done: e.target.checked } })} />
                    <input className="inline-edit" defaultValue={item.text} onBlur={(e) => e.target.value !== item.text && send({ type: 'checklist.update', itemId: item.id, patch: { text: e.target.value } })} />
                    <button className="icon" onClick={() => send({ type: 'checklist.delete', itemId: item.id })}>✕</button>
                  </li>
                ))}
              </ul>
              <input
                placeholder="+ Novo item (Enter)"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim()) {
                    send({ type: 'checklist.add', cardId, text: newItem.trim() });
                    setNewItem('');
                  }
                }}
              />
            </section>

            {workflow.kind === 'parent' && childWf && (
              <section className="drawer-section">
                <div className="section-head">
                  <h3>Sub-tarefas <small>{children.length}</small></h3>
                  <button className="ghost small" onClick={() => { selectParent(null); selectParent(card.id); openCard(null); }}>Ver no board</button>
                </div>
                <ul className="children">
                  {children.map((c) => {
                    const col = state.columns.find((x) => x.id === c.columnId);
                    return (
                      <li key={c.id} className={col?.isTerminal ? 'done' : ''}>
                        <a onClick={() => openCard(c.id)}><span className="card-id">{cardRef(c)}</span> {c.title}</a>
                        <span className="muted">{c.archivedAt ? 'Arquivada' : col?.name}</span>
                      </li>
                    );
                  })}
                </ul>
                <input placeholder="+ Nova sub-tarefa (Enter)" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
              </section>
            )}
          </>
        )}

        <footer className="drawer-footer muted">
          Criado {new Date(card.createdAt).toLocaleString()} · Atualizado {new Date(card.updatedAt).toLocaleString()}
        </footer>
      </aside>
    </>
  );
}
