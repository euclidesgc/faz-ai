import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

export const renderMarkdown = (src: string): string => marked.parse(src) as string;

type Format = 'bold' | 'italic' | 'heading' | 'ul' | 'ol' | 'task' | 'code' | 'quote' | 'link';

const TOOLS: { kind: Format; label: string; title: string }[] = [
  { kind: 'bold', label: 'B', title: 'Negrito (Cmd+B)' },
  { kind: 'italic', label: 'I', title: 'Itálico (Cmd+I)' },
  { kind: 'heading', label: 'H', title: 'Título' },
  { kind: 'ul', label: '•', title: 'Lista' },
  { kind: 'ol', label: '1.', title: 'Lista numerada' },
  { kind: 'task', label: '☑', title: 'Lista de tarefas' },
  { kind: 'quote', label: '❝', title: 'Citação' },
  { kind: 'code', label: '</>', title: 'Código' },
  { kind: 'link', label: '🔗', title: 'Link (Cmd+K)' },
];

/** Aplica a formatação sobre a seleção e devolve o novo texto e a nova seleção. */
export function applyFormat(value: string, start: number, end: number, kind: Format): { value: string; start: number; end: number } {
  const sel = value.slice(start, end);
  const wrap = (before: string, after: string, placeholder: string) => {
    const text = sel || placeholder;
    return { value: value.slice(0, start) + before + text + after + value.slice(end), start: start + before.length, end: start + before.length + text.length };
  };
  const prefixLines = (prefix: (i: number) => string) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = value.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const block = value.slice(lineStart, lineEnd).split('\n').map((l, i) => prefix(i) + l).join('\n');
    return { value: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length };
  };
  switch (kind) {
    case 'bold': return wrap('**', '**', 'texto');
    case 'italic': return wrap('_', '_', 'texto');
    case 'code': return sel.includes('\n') ? wrap('```\n', '\n```', 'código') : wrap('`', '`', 'código');
    case 'link': return wrap('[', '](https://)', 'texto');
    case 'heading': return prefixLines(() => '## ');
    case 'ul': return prefixLines(() => '- ');
    case 'ol': return prefixLines((i) => `${i + 1}. `);
    case 'task': return prefixLines(() => '- [ ] ');
    case 'quote': return prefixLines(() => '> ');
  }
}

interface Props {
  value: string;
  onChange(value: string): void;
  /** chamado quando o campo perde o foco (para salvar) */
  onCommit?(): void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  /** Cmd/Ctrl+Enter */
  onSubmit?(): void;
  /** arquivos colados (ex.: uma imagem): devolve o markdown a inserir no lugar do cursor */
  onPasteFiles?(files: File[]): string;
  /** esconde o botão de expandir (usado dentro do próprio modo expandido e nos comentários) */
  compact?: boolean;
}

export function MarkdownEditor({ value, onChange, onCommit, placeholder, minRows = 8, autoFocus, onSubmit, onPasteFiles, compact }: Props) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // altura acompanha o conteúdo
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.6)}px`;
  }, [value, mode, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setExpanded(false);
        onCommit?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded, onCommit]);

  const format = (kind: Format) => {
    const el = ref.current;
    if (!el) return;
    const r = applyFormat(value, el.selectionStart, el.selectionEnd, kind);
    onChange(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); }
    else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); }
    else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); format('link'); }
    else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      onChange(value.slice(0, s) + '  ' + value.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  const toolbar = (
    <div className="md-toolbar">
      {TOOLS.map((t) => (
        <button key={t.kind} className={`icon md-${t.kind}`} title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => format(t.kind)}>{t.label}</button>
      ))}
      <span className="spacer" />
      {!expanded && (
        <>
          <button className={`ghost small ${mode === 'write' ? 'on' : ''}`} onClick={() => setMode('write')}>Escrever</button>
          <button className={`ghost small ${mode === 'preview' ? 'on' : ''}`} onClick={() => { setMode('preview'); onCommit?.(); }}>Visualizar</button>
        </>
      )}
      {!compact && (
        <button className="ghost small" title={expanded ? 'Recolher (Esc)' : 'Expandir editor'} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (expanded) onCommit?.(); setExpanded(!expanded); setMode('write'); }}>
          {expanded ? '⤡ Recolher' : '⤢ Expandir'}
        </button>
      )}
    </div>
  );

  const textarea = (
    <textarea
      ref={ref}
      autoFocus={autoFocus || expanded}
      rows={minRows}
      value={value}
      placeholder={placeholder ?? 'Markdown suportado'}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (!onPasteFiles || !files.length) return;
        e.preventDefault();
        const el = e.currentTarget;
        const text = onPasteFiles(files);
        if (text) onChange(`${value.slice(0, el.selectionStart)}${text}${value.slice(el.selectionEnd)}`);
      }}
    />
  );

  const preview = <div className="markdown" dangerouslySetInnerHTML={{ __html: value.trim() ? renderMarkdown(value) : '<p class="muted">Nada para visualizar.</p>' }} />;

  if (expanded) {
    return (
      <div className="md-expanded">
        <div className="md-editor">
          {toolbar}
          <div className="md-split">
            {textarea}
            {preview}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md-editor">
      {toolbar}
      {mode === 'write' ? textarea : preview}
    </div>
  );
}
