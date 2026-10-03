import { useState } from 'react';
import type { Comment } from '../../shared/model';
import { aiToolInfo } from '../../shared/harness';
import { RUNNER_PERMISSIONS } from '../../shared/runner';
import { useBoardStore } from '../store/boardStore';
import { MAX_ATTACHMENT_BYTES, toBase64 } from './AttachmentsTab';

/** Referência a um anexo do card dentro de uma mensagem: `attachment:<nome do arquivo>`. */
const ATTACHMENT_SCHEME = 'attachment:';
const ATTACHMENT_LINK = /\]\(attachment:([^)\s]+)\)/g;
import { MarkdownEditor, renderMarkdown } from './MarkdownEditor';
import { Button, DeleteButton } from './ui';

/** Conversa do card: é por aqui que a pessoa e a IA falam sobre o trabalho. */
export function CommentsTab({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const baseUri = useBoardStore((s) => s.attachmentsBaseUri);
  const setError = useBoardStore((s) => s.setError);
  const openSettings = useBoardStore((s) => s.openSettings);
  const [draft, setDraft] = useState('');
  const comments = state.comments.filter((c) => c.cardId === cardId);
  const card = state.cards.find((c) => c.id === cardId);
  const running = state.aiRuns.includes(cardId);
  const toolLabel = aiToolInfo(state.board.aiTool).label;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === state.board.runner.permission)!;
  const canCall = !!card && card.deletedAt === null && card.archivedAt === null && !state.aiRunUnsupported;

  const submit = () => {
    if (!draft.trim()) return;
    send({ type: 'comment.add', cardId, body: draft.trim() });
    setDraft('');
  };

  /** Envia o que estiver escrito e chama a IA para o card. */
  const callAi = () => {
    submit();
    send({ type: 'ai.run', cardId });
  };

  // imagem colada vira anexo do card e entra na mensagem como referência a ele
  const pasteFiles = (files: File[]): string =>
    files
      .map((file, i) => {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`"${file.name}" tem mais de 20 MB e não foi anexado.`);
          return '';
        }
        const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const filename = `colado-${Date.now()}${i ? `-${i}` : ''}.${ext}`;
        void toBase64(file).then((base64) => send({ type: 'attachment.addData', cardId, filename, base64 }));
        return file.type.startsWith('image/') ? `![${filename}](${ATTACHMENT_SCHEME}${filename})` : `[${filename}](${ATTACHMENT_SCHEME}${filename})`;
      })
      .filter(Boolean)
      .join('\n');

  /** Troca as referências `attachment:<nome>` pelo endereço do anexo, para a imagem aparecer na conversa. */
  const resolve = (body: string): string =>
    body.replace(ATTACHMENT_LINK, (whole, name: string) => {
      const a = state.attachments.find((x) => x.cardId === cardId && x.filename === name);
      return a && baseUri ? `](${baseUri}/${a.cardId}/${encodeURIComponent(a.storedName)})` : whole;
    });

  return (
    <section className="drawer-section comments">
      {comments.length === 0 && <p className="muted">Nenhuma mensagem ainda. A conversa com a IA sobre este card acontece aqui.</p>}
      {comments.map((c) => <CommentItem key={c.id} comment={c} mine={c.author === state.currentUser} render={resolve} />)}
      {running && (
        <div className="banner ai-running">
          <span className="spinner" />
          <span>{toolLabel} está trabalhando neste card… A resposta aparece aqui quando terminar.</span>
          <span className="spacer" />
          <Button variant="ghost" size="small" onClick={() => send({ type: 'ai.stop', cardId })}>Parar</Button>
        </div>
      )}
      <div className="comment-new">
        <MarkdownEditor compact minRows={3} value={draft} onChange={setDraft} onSubmit={submit} onPasteFiles={pasteFiles} placeholder="Escreva uma mensagem… (Cmd+Enter envia; cole imagens direto aqui)" />
        <div className="row wrap">
          <span className="muted small ai-permission" title={state.aiRunUnsupported ?? permission.hint}>
            {state.aiRunUnsupported ? `Chamar a IA daqui não está disponível para o ${toolLabel}.` : `Permissão do ${toolLabel} ao ser chamado: ${permission.label}.`}{' '}
            <a onClick={() => openSettings('harness')}>Mudar</a>
          </span>
          <span className="spacer" />
          <Button disabled={!draft.trim()} onClick={submit}>Enviar</Button>
          <Button
            variant="primary"
            disabled={!canCall || running}
            title={state.aiRunUnsupported ?? `Roda o ${toolLabel} em segundo plano para ler a conversa e trabalhar neste card. A resposta chega aqui, sem acompanhamento ao vivo.`}
            onClick={callAi}
          >{draft.trim() ? 'Enviar e chamar IA' : '▶ Chamar IA'}</Button>
        </div>
      </div>
    </section>
  );
}

function CommentItem({ comment, mine, render }: { comment: Comment; mine: boolean; render: (body: string) => string }) {
  const send = useBoardStore((s) => s.send);
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
        {/* editar só a própria mensagem; apagar vale para qualquer um, inclusive os escritos pela IA */}
        {editing === null && (
          <>
            {mine && <Button variant="ghost" size="small" onClick={() => setEditing(comment.body)}>Editar</Button>}
            <DeleteButton
              variant="ghost"
              size="small"
              question={mine ? 'Apagar esta mensagem?' : `Apagar a mensagem de ${comment.author}?`}
              onConfirm={() => send({ type: 'comment.delete', commentId: comment.id })}
            >
              Apagar
            </DeleteButton>
          </>
        )}
      </header>
      {editing === null ? (
        <div className="markdown plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(render(comment.body)) }} />
      ) : (
        <>
          <MarkdownEditor compact autoFocus minRows={3} value={editing} onChange={setEditing} onSubmit={save} />
          <div className="row end">
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Salvar</Button>
          </div>
        </>
      )}
    </article>
  );
}
