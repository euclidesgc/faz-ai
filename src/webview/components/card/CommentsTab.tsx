import { toolInfo, activeProfile } from '../../../shared/aiProfiles';
import { useState } from 'react';
import type { Comment } from '../../../shared/model';
import { RUNNER_PERMISSIONS } from '../../../shared/runner';
import { isLive } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { usePending } from '../../usePending';
import { useAction } from '../../useAction';
import { ai, comments } from '../../commands';
import { BOARD_AUTHOR } from '../../../shared/gitflow';
import { formatDateTime, t, translateGitNotice } from '../../i18n';
import { useAttachmentRefs } from './attachmentRefs';
import { MarkdownEditor, renderMarkdown } from '../MarkdownEditor';
import { aiBlockedReason, cardToolLabel } from '../RequirementsBanner';
import { Button, DeleteButton, Hint, IconRun, IconSuggest } from '../ui';
import { summarizeHint, workHint } from '../aiHints';
import { activeComments } from '../../../shared/conversation';

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
  const { pasteFiles, resolve } = useAttachmentRefs(cardId);
  const openSettings = useBoardStore((s) => s.openSettings);
  const [own, setOwn] = useState('');
  const draft = kept ?? own;
  const setDraft = onDraft ?? setOwn;
  const cardComments = state.comments.filter((c) => c.cardId === cardId);
  // as mensagens antes do último resumo já estão nele e não vão mais para a IA: aparecem esmaecidas
  const active = new Set(activeComments(state.comments, cardId).map((c) => c.id));
  const card = state.cards.find((c) => c.id === cardId);
  const running = state.aiRuns.includes(cardId);
  // "Resumir a conversa" e "Trabalhar na fase" travam logo após o clique, até aiRuns refletir a execução (ou o tempo esgotar)
  const [, summarizing, markSummarizing] = usePending(running);
  const [, starting, markStarting] = usePending(running);
  // a mensagem só sai do campo quando o host confirma: se falhar, o texto fica para tentar de novo
  const send = useAction((body: string) => comments.add(cardId, body));
  const toolLabel = card ? cardToolLabel(state, card) : toolInfo(activeProfile(state.board)).label;
  const permission = RUNNER_PERMISSIONS.find((p) => p.value === state.board.runner.permission)!;
  const blocked = aiBlockedReason(state, card);
  const canCall = !!card && isLive(card) && !blocked;

  const submit = async () => {
    if (!draft.trim()) return false;
    const ok = await send.run(draft.trim());
    if (ok) setDraft('');
    return ok;
  };

  /** Envia o que estiver escrito e chama a IA para o card. */
  const callAi = async () => {
    if (draft.trim() && !(await submit())) return;
    markStarting(true);
    void ai.run(cardId);
  };

  return (
    <section className="drawer-section comments">
      {cardComments.length === 0 && (
        <p className="muted">{t('Nenhuma mensagem ainda. A conversa com a IA sobre este card acontece aqui.')}</p>
      )}
      {cardComments.length >= 2 && (
        // À direita e em destaque: resumir é a ação principal de uma conversa longa, e fica onde os botões de ação do card ficam
        <div className="row end">
          <Hint content={summarizeHint()} disabledReason={blocked}>
            <Button
              variant="primary"
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
        </div>
      )}
      {cardComments.map((c, i) => (
        <CommentItem
          key={c.id}
          comment={c}
          mine={c.author === state.currentUser}
          inactive={!active.has(c.id)}
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
          onSubmit={() => void submit()}
          onPasteFiles={pasteFiles}
          resolveRefs={resolve}
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
          <Button disabled={!draft.trim()} loading={send.busy} onClick={() => void submit()}>
            {t('Enviar')}
          </Button>
          <Hint content={workHint(toolLabel)} disabledReason={blocked}>
            <Button variant="primary" disabled={!canCall || running} loading={starting} onClick={() => void callAi()}>
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

/**
 * Traduz um comentário do board linha a linha, só pelas chaves dos avisos do gitflow (translateGitNotice): o relatório
 * da limpeza da história junta o título e uma linha "- " por item, e cada uma tem a própria chave. Linha sem tradução
 * fica como está, e os outros comentários do board (autopiloto, runner) não são tocados.
 */
function boardNotice(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      const m = /^(\s*(?:[-*]\s+)?)(.*)$/.exec(line)!;
      return m[1]! + translateGitNotice(m[2]!);
    })
    .join('\n');
}

function CommentItem({
  comment,
  mine,
  inactive,
  render,
  priorIds,
}: {
  comment: Comment;
  mine: boolean;
  /** anterior ao último resumo: já está nele e não entra mais no contexto da IA */
  inactive: boolean;
  render: (body: string) => string;
  /** ids dos comentários anteriores a este na conversa; usado pela recomendação de apagar o resumo */
  priorIds: string[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // editar e apagar mostram a espera na própria mensagem (botão e linha esmaecida) até o host responder
  const save = useAction((body: string) => comments.update(comment.id, body));
  const remove = useAction(() => comments.delete(comment.id));
  const removePrior = useAction(() => comments.deleteMany(priorIds));
  const busy = remove.busy || removePrior.busy;
  // o board grava os avisos do gitflow em português (o idioma só se resolve na tela); os outros comentários dele e os das
  // pessoas aparecem como foram escritos
  const shown = comment.author === BOARD_AUTHOR ? boardNotice(comment.body) : comment.body;

  const commit = async () => {
    if (editing?.trim() && editing !== comment.body && !(await save.run(editing.trim()))) return;
    setEditing(null);
  };

  return (
    <article
      className={`comment${inactive ? ' comment-inactive' : ''}${comment.kind === 'summary' ? ' comment-summary-item' : ''}`}
      aria-busy={busy || undefined}
      title={inactive ? t('Mensagem anterior ao resumo: já está refletida nele e não vai mais para a IA.') : undefined}
    >
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
              loading={remove.busy}
              question={mine ? t('Apagar esta mensagem?') : t('Apagar a mensagem de {author}?', { author: comment.author })}
              onConfirm={() => void remove.run()}
            >
              {t('Apagar')}
            </DeleteButton>
          </>
        )}
      </header>
      {editing === null ? (
        <div className="markdown plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(render(shown)) }} />
      ) : (
        <>
          <MarkdownEditor
            compact
            autoFocus
            minRows={3}
            value={editing}
            onChange={setEditing}
            onSubmit={() => void commit()}
            resolveRefs={render}
          />
          <div className="row end">
            <Button onClick={() => setEditing(null)}>{t('Cancelar')}</Button>
            <Button variant="primary" loading={save.busy} onClick={() => void commit()}>
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
              {t('As mensagens anteriores a este resumo já estão refletidas nele e não vão mais para a IA. Você pode apagá-las.')}
              <DeleteButton
                variant="ghost"
                size="small"
                question={t('Apagar as {count} mensagens anteriores a este resumo?', { count: priorIds.length })}
                confirmLabel={t('Apagar mensagens')}
                loading={removePrior.busy}
                onConfirm={() => void removePrior.run()}
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
