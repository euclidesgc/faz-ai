import { useEffect, useRef, useState } from 'react';
import { request } from '../../../request';
import { useAction } from '../../../useAction';
import { SegmentedControl } from '@radix-ui/themes';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { onHostMessage, postToHost } from '../../../vscode';
import { renderSafeMarkdown } from '../../attachment/AttachmentModal';
import { Button, IconClose } from '../../ui';
import { t } from '../../../i18n';

/** Markdown das ferramentas: as rules do Cursor são `.mdc`. */
const isMarkdownFile = (file: string): boolean => /\.(md|mdc|markdown)$/i.test(file);

/** Quanto a modal espera a leitura do arquivo antes de desistir e explicar o que fazer. */
export const READ_TIMEOUT_MS = 8000;
const NO_REPLY =
  'O board não respondeu. Se a extensão acabou de ser atualizada, recarregue a janela (no VS Code, Developer: Reload Window) e abra o arquivo de novo.';

/** Separa o frontmatter (`---` no topo) do corpo, para o modo formatado mostrar os metadados à parte. */
export function splitFrontmatter(src: string): { meta: string | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  return m ? { meta: m[1]!, body: src.slice(m[0].length) } : { meta: null, body: src };
}

/**
 * Um arquivo do harness (rule, skill, agente, comando, configuração) aberto no board, no mesmo modelo da
 * modal de anexos: Markdown formatado ou código, edição com salvar e cancelar, e proteção contra fechar
 * com texto não salvo. O que vem de plugin e o `~/.claude.json` abrem só para leitura.
 */
export function HarnessFileModal() {
  const file = useBoardStore((s) => s.harnessFile);
  const close = useBoardStore((s) => s.closeHarnessFile);
  // nome e caminho de exibição vêm da varredura; o arquivo apagado por fora some da lista e a modal avisa
  const item = useBoardStore((s) => {
    const items = s.state?.harness.inventory.flatMap((x) => x.items) ?? [];
    // um arquivo importado com @ não é item da lista: o caminho de exibição vem da importação
    return (
      items.find((i) => i.path === s.harnessFile) ?? items.flatMap((i) => i.imports ?? []).find((x) => x.path === s.harnessFile) ?? null
    );
  });

  const [content, setContent] = useState<string | null>(null);
  const [readonly, setReadonly] = useState(true);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedNotice, setUnsavedNotice] = useState(false);
  const dirty = editing && draft !== (content ?? '');
  const guard = useRef({ dirty, close });
  guard.current = { dirty, close };
  const requestClose = () => (guard.current.dirty ? setUnsavedNotice(true) : guard.current.close());

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

  // abrir (ou trocar de arquivo) recomeça do zero e lê o conteúdo do disco
  useEffect(() => {
    setContent(null);
    setDraft('');
    setEditing(false);
    setViewMode('formatted');
    setError(null);
    setUnsavedNotice(false);
    setReadonly(true);
    if (!file) return;
    setLoading(true);
    const requestId = crypto.randomUUID();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'harness.file.readResult' || msg.requestId !== requestId) return;
      off();
      window.clearTimeout(timer);
      setLoading(false);
      if (msg.error) return setError(msg.error);
      setContent(msg.content ?? '');
      setReadonly(msg.readonly === true);
    });
    // a leitura é imediata; sem resposta, o host é de outra versão (pacote reinstalado sem recarregar a janela)
    const timer = window.setTimeout(() => {
      off();
      setLoading(false);
      setError(t(NO_REPLY));
    }, READ_TIMEOUT_MS);
    postToHost({ type: 'harness.file.read', requestId, path: file });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [file]);

  // o host confirma a gravação pelo `done`; se falhou (JSON inválido, sem permissão), o texto fica na tela
  const write = useAction(() => request({ type: 'harness.file.write', path: file ?? '', content: draft }));
  const saving = write.busy;

  if (!file) return null;

  const save = async () => {
    if (saving) return;
    setError(null);
    if (!(await write.run())) return; // o erro do host fica em `write.error`
    setContent(draft);
    setEditing(false);
    setUnsavedNotice(false);
  };

  const markdown = isMarkdownFile(file);
  const name = file.split(/[\\/]/).pop() ?? file;
  const parts = content !== null && markdown ? splitFrontmatter(content) : null;

  return (
    <div className="modal-backdrop" onMouseDown={requestClose}>
      <div className="modal attachment-modal harness-file-modal" role="dialog" aria-label={name} onMouseDown={(e) => e.stopPropagation()}>
        <header className="attachment-modal-head">
          <h2 title={file}>
            {name}
            <span className="muted small harness-file-path">{item?.location ?? file}</span>
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
            <p className="muted small">{t('Somente leitura: este arquivo é mantido pela ferramenta ou por um plugin.')}</p>
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
              <Button onClick={() => harness.openItem(file)}>{t('Abrir no editor')}</Button>
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
