import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { Button, IconCheck, IconMore } from './ui';

export type MenuItem =
  { label: string; onClick(): void; danger?: boolean; disabled?: boolean; checked?: boolean } | { header: string } | 'sep';

/** Botão que abre um menu flutuante. Renderizado em portal para não ser cortado nem afetado por transforms. */
export function Menu({ items, title, children = <IconMore /> }: { items: MenuItem[]; title?: string; children?: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // O conjunto de ações pode ser maior que a tela; reposiciona o menu para caber antes de rolar.
  useLayoutEffect(() => {
    if (!pos || !menu.current) return;
    const rect = menu.current.getBoundingClientRect();
    const top = Math.max(8, Math.min(pos.top, window.innerHeight - rect.height - 8));
    const left = Math.max(8, Math.min(pos.left, window.innerWidth - rect.width - 8));
    if (top !== pos.top || left !== pos.left) setPos({ top, left });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    // na captura e marcado como tratado: o Esc fecha só o menu, e não o card aberto por baixo (que
    // escuta o Esc depois e ignora o evento já tratado)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('mousedown', close);
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menu.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const width = 320;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };

  return (
    <>
      <Button
        ref={btn}
        variant="icon"
        className="menu-trigger"
        title={title ?? t('Mais ações')}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {children}
      </Button>
      {pos &&
        createPortal(
          <div ref={menu} className="menu" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              it === 'sep' ? (
                <hr key={i} />
              ) : 'header' in it ? (
                <span key={i} className="menu-header">
                  {it.header}
                </span>
              ) : (
                <Button
                  key={i}
                  danger={it.danger}
                  disabled={it.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPos(null);
                    it.onClick();
                  }}
                >
                  <span className="menu-check">{it.checked && <IconCheck />}</span>
                  {it.label}
                </Button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
