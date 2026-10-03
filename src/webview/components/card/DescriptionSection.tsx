import { MarkdownEditor, renderMarkdown } from '../MarkdownEditor';
import { Button } from '../ui';
import type { DescriptionDraft } from './useDescriptionDraft';

/** Descrição em Markdown: lida renderizada, editada no editor ao clicar. */
export function DescriptionSection({ draft }: { draft: DescriptionDraft }) {
  const { desc, setDesc, editing, setEditing, save } = draft;

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>Descrição</h3>
        {!editing && (
          <Button variant="ghost" size="small" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
        {editing && (
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              save();
              setEditing(false);
            }}
          >
            Concluir
          </Button>
        )}
      </div>
      {editing ? (
        <MarkdownEditor
          autoFocus
          minRows={12}
          value={desc}
          onChange={setDesc}
          onCommit={save}
          placeholder="Descreva o problema, o contexto e o critério de aceite. Markdown suportado."
        />
      ) : (
        <div
          className="markdown clickable"
          onClick={(e) => (e.target as HTMLElement).tagName !== 'A' && setEditing(true)}
          dangerouslySetInnerHTML={{
            __html: desc.trim() ? renderMarkdown(desc) : '<p class="muted">Clique para adicionar uma descrição…</p>',
          }}
        />
      )}
    </section>
  );
}
