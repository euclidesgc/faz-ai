import { useEffect, useState } from 'react';
import { cardRef } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { attachments } from '../../commands';
import { Button, DeleteButton } from '../ui';
import { formatDateTime, t } from '../../i18n';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const formatSize = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AttachmentsTab({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const baseUri = useBoardStore((s) => s.attachmentsBaseUri);
  const setError = useBoardStore((s) => s.setError);
  const [over, setOver] = useState(false);
  const cardAttachments = state.attachments.filter((a) => a.cardId === cardId);
  // os documentos das fases ficam na história; a sub-tarefa só aponta para eles
  const parent = state.cards.find((c) => c.id === state.cards.find((x) => x.id === cardId)?.parentId);
  const storyArtifacts = parent ? state.attachments.filter((a) => a.cardId === parent.id && a.artifact) : [];

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(t('"{name}" tem mais de 20 MB e não foi anexado.', { name: file.name }));
        continue;
      }
      attachments.addData({ cardId, filename: file.name || `colado-${Date.now()}.png`, base64: await toBase64(file) });
    }
  };

  // colar imagem ou arquivo da área de transferência enquanto a aba está aberta
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  return (
    <section className="drawer-section">
      {parent && storyArtifacts.length > 0 && (
        <div className="story-artifacts">
          <h3>
            {t('Artefatos da história')}{' '}
            <small>
              {cardRef(parent)} {parent.title}
            </small>
          </h3>
          <ul className="attachments">
            {storyArtifacts.map((a) => (
              <li key={a.id}>
                <span className="thumb file" onClick={() => attachments.open(a.id)}>
                  {(a.filename.split('.').pop() ?? '').slice(0, 4).toUpperCase() || '?'}
                </span>
                <div className="att-info">
                  <a title={t('Abre o documento anexado à história')} onClick={() => attachments.open(a.id)}>
                    {a.filename}
                  </a>
                  <span className="muted small">
                    {t('anexado à história')} · {formatDateTime(a.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <Button variant="primary" onClick={() => attachments.pick(cardId)}>
          {t('Escolher arquivos…')}
        </Button>
        <span className="muted">{t('ou arraste arquivos para cá (segure Shift ao soltar), ou cole uma imagem. Até 20 MB cada.')}</span>
      </div>

      {cardAttachments.length === 0 && <p className="muted">{t('Nenhum anexo.')}</p>}
      <ul className="attachments">
        {cardAttachments.map((a) => (
          <li key={a.id}>
            {a.mime.startsWith('image/') && baseUri ? (
              <img
                className="thumb"
                src={`${baseUri}/${a.cardId}/${encodeURIComponent(a.storedName)}`}
                alt=""
                onClick={() => attachments.open(a.id)}
              />
            ) : (
              <span className="thumb file" onClick={() => attachments.open(a.id)}>
                {(a.filename.split('.').pop() ?? '').slice(0, 4).toUpperCase() || '?'}
              </span>
            )}
            <div className="att-info">
              <a onClick={() => attachments.open(a.id)}>{a.filename}</a>
              {a.artifact && (
                <span className="badge artifact-badge" title={t('Documento de uma fase')}>
                  {t('artefato')}
                </span>
              )}
              <span className="muted small">
                {formatSize(a.size)} · {formatDateTime(a.createdAt)}
              </span>
            </div>
            <Button variant="ghost" size="small" onClick={() => attachments.reveal(a.id)}>
              {t('Mostrar na pasta')}
            </Button>
            <DeleteButton
              title={t('Remover anexo')}
              question={t('Remover "{name}"?', { name: a.filename })}
              message={t('O arquivo anexado será apagado.')}
              confirmLabel={t('Remover')}
              onConfirm={() => attachments.delete(a.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
