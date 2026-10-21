import { useEffect, useRef, useState } from 'react';
import { useAction } from '../../../useAction';
import { SegmentedControl } from '@radix-ui/themes';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { renderSafeMarkdown } from '../../attachment/AttachmentModal';
import { Button, IconClose } from '../../ui';
import { useArtifactText } from './useArtifactText';
import { t } from '../../../i18n';

/** Separa o frontmatter (`---` no topo) do corpo, para o modo formatado mostrar os metadados à parte. */
export function splitFrontmatter(src: string): { meta: string | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  return m ? { meta: m[1]!, body: src.slice(m[0].length) } : { meta: null, body: src };
}

/**
 * Um texto de artefato do board aberto na modal, no mesmo modelo da modal de anexos: Markdown formatado ou código,
 * edição com salvar e cancelar, e proteção contra fechar com texto não salvo. Lê por `harness.artifact.read` e grava
 * por `harness.artifact.save` (regra, SKILL.md) ou `harness.skillFile.write` (arquivo de apoio da skill). A skill do
 * fluxo, gerada pela extensão, abre só para leitura.
 */
export function HarnessFileModal() {
  const file = useBoardStore((s) => s.harnessFile);
  const close = useBoardStore((s) => s.closeHarnessFile);
  const generated = useBoardStore(
    (s) => !!file && s.state?.harness.library?.artifacts.some((a) => a.kind === file.kind && a.name === file.name && a.generated === true),
  );
  const read = useArtifactText(file?.kind ?? 'rule', file?.name, file?.file);
  // o que acabou de ser salvo vale no lugar da leitura, que só se repete ao abrir outro texto
  const [saved, setSaved] = useState<string | null>(null);
  const content = saved ?? read.text;
  const readonly = !!generated;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [unsavedNotice, setUnsavedNotice] = useState(false);
  const dirty = editing && draft !== (content ?? '');
  const guard = useRef({ dirty, close });
  guard.current = { dirty, close };
  const requestClose = () => (guard.current.dirty ? setUnsavedNotice(true) : guard.current.close());
  const key = file ? `${file.kind}:${file.name}:${file.file ?? ''}` : '';

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [file, close]);

  // abrir (ou trocar de texto) recomeça do zero
  useEffect(() => {
    setSaved(null);
    setDraft('');
    setEditing(false);
    setViewMode('formatted');
    setUnsavedNotice(false);
  }, [key]);

  const write = useAction(() => {
    if (!file) return;
    return file.file
      ? harness.writeBoardSkillFile(file.name, file.file, draft)
      : harness.saveArtifact({ kind: file.kind, name: file.name, body: draft, via: 'manual' });
  });
  const saving = write.busy;
  const error = read.error;

  if (!file) return null;

  const save = async () => {
    if (saving) return;
    if (!(await write.run())) return; // o erro do host fica em `write.error`
    setSaved(draft);
    setEditing(false);
    setUnsavedNotice(false);
  };

  // a regra é Markdown; o arquivo de apoio da skill, só quando a extensão diz
  const markdown = !file.file || /\.(md|markdown)$/i.test(file.file);
  const title = file.kind === 'rule' ? file.name : `${file.name}/${file.file ?? 'SKILL.md'}`;
  const parts = content !== null && markdown ? splitFrontmatter(content) : null;
  const loading = read.loading && saved === null;

  return (
    <div className="modal-backdrop" onMouseDown={requestClose}>
      <div className="modal attachment-modal harness-file-modal" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="attachment-modal-head">
          <h2 title={title}>
            {title}
            <span className="muted small harness-file-path">{file.kind === 'rule' ? t('Regra do board') : t('Skill do board')}</span>
          </h2>
          {markdown && !editing && (
            <SegmentedControl.Root
              size="1"
              value={viewMode}
              onValueChange={(v) => setViewMode(v as 'formatted' | 'raw')}
              aria-label={t('Modo de visualização')}
            >
              <SegmentedControl.Item value="formatted">{t('Formatado')}</SegmentedControl.Item>
              <SegmentedControl.Item value="raw">{t('Código')}</SegmentedControl.Item>
            </SegmentedControl.Root>
          )}
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
          {(error ?? write.error) && (
            <p className="banner warn" role="alert">
              {t(error ?? write.error ?? '')}
            </p>
          )}
          {readonly && content !== null && (
            <p className="muted small">{t('Somente leitura: esta skill é gerada pela extensão e regravada a cada abertura.')}</p>
          )}
          {loading ? (
            <p className="muted">{t('Carregando…')}</p>
          ) : editing ? (
            <textarea aria-label={t('Conteúdo do arquivo')} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          ) : parts && viewMode === 'formatted' ? (
            <>
              {parts.meta && <pre className="harness-file-meta">{parts.meta}</pre>}
              <div className="markdown plain" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(parts.body) }} />
            </>
          ) : (
            content !== null && <pre>{content}</pre>
          )}
        </div>

        <div className="row end wrap">
          {editing ? (
            <>
              <Button onClick={() => setEditing(false)}>{t('Cancelar')}</Button>
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                {t('Salvar')}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={content === null} onClick={() => void navigator.clipboard?.writeText(content ?? '')}>
                {t('Copiar conteúdo')}
              </Button>
              {!readonly && content !== null && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setDraft(content);
                    setEditing(true);
                  }}
                >
                  {t('Editar')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
