import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';

/** Diálogo de confirmação (window.confirm não funciona dentro de webviews do VSCode). */
export function Dialog() {
  const dialog = useBoardStore((s) => s.dialog);
  const ask = useBoardStore((s) => s.ask);
  const [choice, setChoice] = useState('');

  useEffect(() => setChoice(dialog?.choices?.options[0]?.value ?? ''), [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ask(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, ask]);

  if (!dialog) return null;
  const confirm = () => {
    ask(null);
    dialog.onConfirm(dialog.choices ? choice : undefined);
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => ask(null)}>
      <div className="modal" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{dialog.title}</h2>
        {dialog.message && <p>{dialog.message}</p>}
        {dialog.choices && (
          <label className="field-row">
            <span>{dialog.choices.label}</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {dialog.choices.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row end wrap">
          <button onClick={() => ask(null)}>{dialog.cancelLabel ?? 'Cancelar'}</button>
          {dialog.secondary && (
            <button
              onClick={() => {
                ask(null);
                dialog.secondary!.onClick();
              }}
            >
              {dialog.secondary.label}
            </button>
          )}
          <button autoFocus className={dialog.danger ? 'primary danger-bg' : 'primary'} onClick={confirm}>
            {dialog.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
