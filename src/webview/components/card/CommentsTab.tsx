import { useState } from 'react';
import type { Comment } from '../../../shared/model';
import { aiToolInfo } from '../../../shared/harness';
import { RUNNER_PERMISSIONS } from '../../../shared/runner';
import { isLive } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { usePending } from '../../usePending';
import { ai, attachments, comments } from '../../commands';
import { MAX_ATTACHMENT_BYTES, toBase64 } from './AttachmentsTab';
import { formatDateTime, t } from '../../i18n';

/** Referência a um anexo do card dentro de uma mensagem: `attachment:<nome do arquivo>`. */
const ATTACHMENT_SCHEME = 'attachment:';
const ATTACHMENT_LINK = /\]\(attachment:([^)\s]+)\)/g;
import { MarkdownEditor, renderMarkdown } from '../MarkdownEditor';
import { aiBlockedReason } from '../RequirementsBanner';
import { Button, DeleteButton, Hint, IconRun, IconSuggest } from '../ui';
import { summarizeHint, workHint } from '../aiHints';

/** Conversa do card: é por aqui que a pessoa e a IA falam sobre o trabalho. */
export function CommentsTab({
  cardId,
  draft: kept,
  onDraft,
}: {
  cardId: string;
  /** a mensagem em escrita, guardada por quem mostra a aba (o card aberto) para sobreviver à troca de aba */
  draft?: string;
  onDraft?: (draft: string) => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const baseUri = useBoardStore((s) => s.attachmentsBaseUri);
  const setError = useBoardStore((s) => s.setError);
  const openSettings = useBoardStore((s) => s.openSettings);
  const [own, setOwn] = useState('');
  const draft = kept ?? own;
  const setDraft = onDraft ?? setOwn;
  const cardComments = state.comments.filter((c) => c.cardId === cardId);
  const card = state.cards.find((c) => c.id === cardId);
  const running = state.aiRuns.includes(cardId);
  // "Resumir a conversa" trava logo após o clique, até aiRuns refletir a execução (ou o tempo esgotar)
  const [, summarizing, markSummarizing] = usePending(running);
  const toolLabel = aiToolInfo(state.board.aiTool).label;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === state.board.runner.permission)!;
  const blocked = aiBlockedReason(state);
  const canCall = !!card && isLive(card) && !blocked;

  const submit = () => {
    if (!draft.trim()) return;
    comments.add(cardId, draft.trim());
    setDraft('');
  };

  /** Envia o que estiver escrito e chama a IA para o card. */
  const callAi = () => {
    submit();
    ai.run(cardId);
  };

  // imagem colada vira anexo do card e entra na mensagem como referência a ele
  const pasteFiles = (files: File[]): string =>
    files
      .map((file, i) => {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(t('"{name}" tem mais de 20 MB e não foi anexado.', { name: file.name }));
          return '';
        }
        const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const filename = `colado-${Date.now()}${i ? `-${i}` : ''}.${ext}`;
        void toBase64(file).then((base64) => attachments.addData({ cardId, filename, base64 }));
        return file.type.startsWith('image/')
          ? `![${filename}](${ATTACHMENT_SCHEME}${filename})`
          : `[${filename}](${ATTACHMENT_SCHEME}${filename})`;
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
      {cardComments.length === 0 && (
        <p className="muted">{t('Nenhuma mensagem ainda. A conversa com a IA sobre este card acontece aqui.')}</p>
      )}
      {cardComments.length >= 2 && (
        <Hint content={summarizeHint()} disabledReason={blocked}>
          <Button
            variant="ghost"
            size="small"
            disabled={!canCall || running || summarizing}
            onClick={() => {
              markSummarizing(true);
              ai.summarize(cardId);
            }}
          >
            <IconSuggest /> {t('Resumir a conversa')}
          </Button>
        </Hint>
      )}
      {cardComments.map((c, i) => (
        <CommentItem
          key={c.id}
          comment={c}
          mine={c.author === state.currentUser}
          render={resolve}
          priorIds={cardComments.slice(0, i).map((p) => p.id)}
        />
      ))}
      {running && (
        <div className="banner ai-running">
          <span className="spinner" />
          <span>{t('{tool} está trabalhando neste card… A resposta aparece aqui quando terminar.', { tool: toolLabel })}</span>
          <span className="spacer" />
          <Button variant="ghost" size="small" onClick={() => ai.stop(cardId)}>
            {t('Parar a IA')}
          </Button>
        </div>
      )}
      <div className="comment-new">
        <MarkdownEditor
          compact
          minRows={3}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onPasteFiles={pasteFiles}
          placeholder={t('Escreva uma mensagem… (Cmd+Enter envia; cole imagens direto aqui)')}
        />
        <div className="row wrap">
          <span className="muted small ai-permission" title={blocked ?? t(permission.hint)}>
            {state.aiRunUnsupported
              ? t('Trabalhar na fase daqui não está disponível para o {tool}.', { tool: toolLabel })
              : t('Permissão do {tool} ao ser chamado: {permission}.', { tool: toolLabel, permission: t(permission.label) })}{' '}
            <a onClick={() => openSettings('harness')}>{t('Mudar')}</a>
          </span>
          <span className="spacer" />
          <Button disabled={!draft.trim()} onClick={submit}>
            {t('Enviar')}
          </Button>
          <Hint content={workHint(toolLabel)} disabledReason={blocked}>
            <Button variant="primary" disabled={!canCall || running} onClick={callAi}>
              {draft.trim() ? (
                t('Enviar e trabalhar na fase')
              ) : (
                <>
                  <IconRun /> {t('Trabalhar na fase')}
                </>
              )}
            </Button>
          </Hint>
        </div>
      </div>
    </section>
  );
}

function CommentItem({
  comment,
  mine,
  render,
  priorIds,
}: {
  comment: Comment;
  mine: boolean;
  render: (body: string) => string;
  /** ids dos comentários anteriores a este na conversa; usado pela recomendação de apagar o resumo */
  priorIds: string[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  const save = () => {
    if (editing?.trim() && editing !== comment.body) comments.update(comment.id, editing.trim());
    setEditing(null);
  };

  return (
    <article className="comment">
      <header className="row">
        <span className="avatar">{comment.author.slice(0, 1).toUpperCase()}</span>
        <strong>{comment.author}</strong>
        <span className="muted small">
          {formatDateTime(comment.createdAt)}
          {comment.updatedAt > comment.createdAt && ` · ${t('editado')}`}
        </span>
        <span className="spacer" />
        {/* editar só a própria mensagem; apagar vale para qualquer um, inclusive os escritos pela IA */}
        {editing === null && (
          <>
            {mine && (
              <Button variant="ghost" size="small" onClick={() => setEditing(comment.body)}>
                {t('Editar')}
              </Button>
            )}
            <DeleteButton
              variant="ghost"
              size="small"
              question={mine ? t('Apagar esta mensagem?') : t('Apagar a mensagem de {author}?', { author: comment.author })}
              onConfirm={() => comments.delete(comment.id)}
            >
              {t('Apagar')}
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
            <Button onClick={() => setEditing(null)}>{t('Cancelar')}</Button>
            <Button variant="primary" onClick={save}>
              {t('Salvar')}
            </Button>
          </div>
        </>
      )}
      {comment.kind === 'summary' && editing === null && (
        <footer className="comment-summary">
          <p className="muted small">{t('Revise o resumo: concorde como está ou edite o que for preciso.')}</p>
          {priorIds.length > 0 && (
            <p className="muted small row">
              {t('As mensagens anteriores a este resumo já estão refletidas nele. Você pode apagá-las para liberar contexto.')}
              <DeleteButton
                variant="ghost"
                size="small"
                question={t('Apagar as {count} mensagens anteriores a este resumo?', { count: priorIds.length })}
                confirmLabel={t('Apagar mensagens')}
                onConfirm={() => comments.deleteMany(priorIds)}
              >
                {t('Apagar mensagens resumidas')}
              </DeleteButton>
            </p>
          )}
        </footer>
      )}
    </article>
  );
}
