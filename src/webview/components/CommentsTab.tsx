import { useState } from 'react';
import type { Comment } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';
import { MarkdownEditor, renderMarkdown } from './MarkdownEditor';

export function CommentsTab({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const [draft, setDraft] = useState('');
  const comments = state.comments.filter((c) => c.cardId === cardId);

  const submit = () => {
    if (!draft.trim()) return;
    send({ type: 'comment.add', cardId, body: draft.trim() });
    setDraft('');
  };

  return (
    <section className="drawer-section comments">
      {comments.length === 0 && <p className="muted">Nenhum comentário ainda.</p>}
      {comments.map((c) => <CommentItem key={c.id} comment={c} mine={c.author === state.currentUser} />)}
      <div className="comment-new">
        <MarkdownEditor compact minRows={3} value={draft} onChange={setDraft} onSubmit={submit} placeholder="Escreva um comentário… (Cmd+Enter envia)" />
        <div className="row end">
          <button className="primary" disabled={!draft.trim()} onClick={submit}>Comentar</button>
        </div>
      </div>
    </section>
  );
}

function CommentItem({ comment, mine }: { comment: Comment; mine: boolean }) {
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [editing, setEditing] = useState<string | null>(null);

  const save = () => {
    if (editing?.trim() && editing !== comment.body) send({ type: 'comment.update', commentId: comment.id, body: editing.trim() });
    setEditing(null);
  };

  return (
    <article className="comment">
      <header className="row">
        <span className="avatar">{comment.author.slice(0, 1).toUpperCase()}</span>
        <strong>{comment.author}</strong>
        <span className="muted small">{new Date(comment.createdAt).toLocaleString()}{comment.updatedAt > comment.createdAt && ' · editado'}</span>
        <span className="spacer" />
        {mine && editing === null && (
          <>
            <button className="ghost small" onClick={() => setEditing(comment.body)}>Editar</button>
            <button
              className="ghost small danger"
              onClick={() => ask({ title: 'Apagar este comentário?', confirmLabel: 'Apagar', danger: true, onConfirm: () => send({ type: 'comment.delete', commentId: comment.id }) })}
            >
              Apagar
            </button>
          </>
        )}
      </header>
      {editing === null ? (
        <div className="markdown plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }} />
      ) : (
        <>
          <MarkdownEditor compact autoFocus minRows={3} value={editing} onChange={setEditing} onSubmit={save} />
          <div className="row end">
            <button onClick={() => setEditing(null)}>Cancelar</button>
            <button className="primary" onClick={save}>Salvar</button>
          </div>
        </>
      )}
    </article>
  );
}
