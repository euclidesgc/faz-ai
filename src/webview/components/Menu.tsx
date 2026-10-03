import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { Button, IconCheck, IconMore } from './ui';

export type MenuItem =
  { label: string; onClick(): void; danger?: boolean; disabled?: boolean; checked?: boolean } | { header: string } | 'sep';

/** Botão que abre um menu flutuante. Renderizado em portal para não ser cortado nem afetado por transforms. */
export function Menu({ items, title, children = <IconMore /> }: { items: MenuItem[]; title?: string; children?: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const width = 230;
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
          <div className="menu" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
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
