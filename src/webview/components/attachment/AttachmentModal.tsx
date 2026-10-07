import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Attachment } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { attachments } from '../../commands';
import { onHostMessage, postToHost } from '../../vscode';
import { Button, IconClose } from '../ui';
import { renderMarkdown } from '../MarkdownEditor';
import { t } from '../../i18n';

/** Anexos cujo conteúdo a modal lê e deixa editar (texto e JSON); o resto é só visualização ou nem isso. */
export const isTextual = (mime: string): boolean => /^(text\/|application\/json)/.test(mime);

/** Markdown: pelo mime, ou pela extensão quando o mime vem genérico (ex.: anexo salvo como texto puro). */
export const isMarkdown = (attachment: Attachment): boolean =>
  attachment.mime === 'text/markdown' || /\.(md|markdown)$/i.test(attachment.filename);

/**
 * HTML do Markdown do anexo, sanitizado: o conteúdo pode vir de fora do controle de quem usa o board
 * (arquivo solto no disco, gerado por IA), diferente da descrição/comentários do card.
 */
export const renderSafeMarkdown = (src: string): string => DOMPurify.sanitize(renderMarkdown(src));

/**
 * Anexo aberto em modal, dentro do board: imagem renderizada, texto/JSON em visualização com edição
 * opcional, e os outros binários só com as ações. Segue o padrão de Dialog.tsx (`.modal-backdrop`/`.modal`,
 * fecha com Escape ou clique fora). O conteúdo de texto é lido na abertura, porque "Copiar conteúdo"
 * também precisa dele.
 */
export function AttachmentModal({ onSaveAs }: { onSaveAs?: (attachment: Attachment) => void } = {}) {
  const open = useBoardStore((s) => s.attachmentModal);
  const close = useBoardStore((s) => s.closeAttachmentModal);
  const baseUri = useBoardStore((s) => s.attachmentsBaseUri);
  // o anexo vem sempre do board: se ele foi removido, a modal mostra isso em vez de dados velhos
  const attachment = useBoardStore((s) => s.state?.attachments.find((a) => a.id === s.attachmentModal?.attachmentId) ?? null);

  const [content, setContent] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // texto editado e não salvo: Esc e clique fora não o descartam sem a pessoa decidir
  const [unsavedNotice, setUnsavedNotice] = useState(false);
  const dirty = editing && draft !== (content ?? '');
  const guard = useRef({ dirty, close });
  guard.current = { dirty, close };
  const requestClose = () => (guard.current.dirty ? setUnsavedNotice(true) : guard.current.close());
  const pendingWrite = useRef<(() => void) | null>(null);
  useEffect(() => () => pendingWrite.current?.(), []);

  const attachmentId = open?.attachmentId ?? null;
  const textual = attachment ? isTextual(attachment.mime) : false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  // abrir a modal (ou trocar de anexo) recomeça do zero e carrega o conteúdo de texto
  useEffect(() => {
    setContent(null);
    setDraft('');
    setEditing(false);
    setError(null);
    setUnsavedNotice(false);
    if (!attachmentId || !textual) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestId = crypto.randomUUID();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'attachment.readResult' || msg.requestId !== requestId) return;
      setLoading(false);
      if (msg.error) setError(msg.error);
      else setContent(msg.content ?? '');
    });
    postToHost({ type: 'attachment.read', requestId, attachmentId });
    return off;
  }, [attachmentId, textual]);

  if (!open) return null;

  const startEditing = () => {
    setDraft(content ?? '');
    setEditing(true);
  };

  const save = () => {
    if (!attachmentId || saving) return;
    setError(null);
    setSaving(true);
    const requestId = crypto.randomUUID();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'attachment.writeResult' || msg.requestId !== requestId) return;
      off();
      pendingWrite.current = null;
      setSaving(false);
      // falhou: o texto digitado fica na tela para a pessoa tentar de novo
      if (!msg.ok) return setError(msg.error ?? t('Não foi possível salvar o anexo.'));
      setContent(draft);
      setEditing(false);
      setUnsavedNotice(false);
    });
    pendingWrite.current = off;
    postToHost({ type: 'attachment.write', requestId, attachmentId, content: draft });
  };

  const image = attachment && attachment.mime.startsWith('image/') && baseUri;

  return (
    <div className="modal-backdrop" onMouseDown={requestClose}>
      <div className="modal attachment-modal" role="dialog" aria-label={attachment?.filename} onMouseDown={(e) => e.stopPropagation()}>
        <header className="attachment-modal-head">
          <h2 title={attachment?.filename}>{attachment?.filename ?? t('Anexos')}</h2>
          <Button variant="icon" title={t('Fechar (Esc)')} aria-label={t('Fechar')} onClick={requestClose}>
            <IconClose />
          </Button>
        </header>

        <div className="attachment-modal-body">
          {unsavedNotice && (
            <p className="banner warn" role="alert">
              {t('O texto editado não foi salvo. Salve, ou clique em Descartar para fechar sem salvar.')}{' '}
              <Button size="small" onClick={close}>
                {t('Descartar')}
              </Button>
            </p>
          )}
          {error && (
            <p className="banner warn" role="alert">
              {t(error)}
            </p>
          )}
          {!attachment ? (
            // o anexo saiu do board enquanto a modal estava aberta: só dá para fechar
            <p className="muted">{t('Anexo não encontrado')}</p>
          ) : image ? (
            <img src={`${baseUri}/${attachment.cardId}/${encodeURIComponent(attachment.storedName)}`} alt={attachment.filename} />
          ) : !textual ? (
            <p className="muted">{t('Pré-visualização não disponível.')}</p>
          ) : loading ? (
            <p className="muted">{t('Carregando…')}</p>
          ) : editing ? (
            <textarea aria-label={t('Conteúdo do anexo')} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          ) : (
            content !== null && <pre>{content}</pre>
          )}
        </div>

        <div className="row end wrap">
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)}>{t('Cancelar')}</Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {t('Salvar')}
              </Button>
            </>
          ) : (
            attachment && (
              <>
                {textual && content !== null && <Button onClick={startEditing}>{t('Editar')}</Button>}
                <Button onClick={() => attachments.reveal(attachment.id)}>{t('Mostrar na pasta')}</Button>
                <Button
                  disabled={content === null}
                  onClick={() => void navigator.clipboard?.writeText(content ?? '')}
                  title={content === null ? t('Só anexos de texto têm conteúdo para copiar.') : undefined}
                >
                  {t('Copiar conteúdo')}
                </Button>
                <Button variant="primary" onClick={() => onSaveAs?.(attachment)}>
                  {t('Salvar como…')}
                </Button>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
