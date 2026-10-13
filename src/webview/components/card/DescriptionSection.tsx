import { MarkdownEditor, renderMarkdown } from '../MarkdownEditor';
import { Button } from '../ui';
import type { DescriptionDraft } from './useDescriptionDraft';
import { t } from '../../i18n';
import { useAttachmentRefs } from './attachmentRefs';

/** Descrição em Markdown: lida renderizada, editada no editor ao clicar. Imagem colada vira anexo do card. */
export function DescriptionSection({ cardId, draft }: { cardId: string; draft: DescriptionDraft }) {
  const { desc, setDesc, editing, setEditing, save } = draft;
  const { pasteFiles, resolve } = useAttachmentRefs(cardId);

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>{t('Descrição')}</h3>
        {!editing && (
          <Button variant="ghost" size="small" onClick={() => setEditing(true)}>
            {t('Editar')}
          </Button>
        )}
      </div>
      {editing ? (
        <>
          <MarkdownEditor
            autoFocus
            minRows={12}
            value={desc}
            onChange={setDesc}
            onCommit={save}
            onPasteFiles={pasteFiles}
            resolveRefs={resolve}
            placeholder={t('Descreva o problema, o contexto e o critério de aceite. Markdown suportado; cole imagens direto aqui.')}
          />
          <div className="row end">
            <Button
              variant="primary"
              onClick={() => {
                save();
                setEditing(false);
              }}
            >
              {t('Salvar descrição')}
            </Button>
          </div>
        </>
      ) : (
        <div
          className="markdown clickable"
          onClick={(e) => (e.target as HTMLElement).tagName !== 'A' && setEditing(true)}
          dangerouslySetInnerHTML={{
            __html: desc.trim() ? renderMarkdown(resolve(desc)) : `<p class="muted">${t('Clique para adicionar uma descrição…')}</p>`,
          }}
        />
      )}
    </section>
  );
}
