import { useEffect, useState } from 'react';
import { TextArea } from '@radix-ui/themes';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { SelectField } from './ui';

/** Diálogo de confirmação (window.confirm não funciona dentro de webviews do VSCode). */
export function Dialog() {
  const dialog = useBoardStore((s) => s.dialog);
  const ask = useBoardStore((s) => s.ask);
  const [choice, setChoice] = useState('');
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    setChoice(dialog?.choices?.value ?? dialog?.choices?.options[0]?.value ?? '');
    setCheckboxChecked(false);
    setText('');
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // com a lista de opções aberta, o Esc é dela: fecha só a lista
        if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
        e.stopPropagation();
        ask(null);
        dialog.onCancel?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, ask]);

  if (!dialog) return null;
  const cancel = () => {
    ask(null);
    dialog.onCancel?.();
  };
  // com texto obrigatório, confirmar só vale preenchido
  const confirmDisabled = !!dialog.text?.required && !text.trim();
  const confirm = () => {
    if (confirmDisabled) return;
    ask(null);
    if (dialog.text)
      dialog.onConfirm(dialog.choices ? choice : undefined, dialog.checkbox ? checkboxChecked : undefined, text.trim() || undefined);
    else if (dialog.checkbox) dialog.onConfirm(dialog.choices ? choice : undefined, checkboxChecked);
    else dialog.onConfirm(dialog.choices ? choice : undefined);
  };

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div className="modal" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{dialog.title}</h2>
        {dialog.message && <p>{dialog.message}</p>}
        {dialog.choices && (
          <label className="field-row">
            <span>{dialog.choices.label}</span>
            <SelectField aria-label={dialog.choices.label} options={dialog.choices.options} value={choice} onChange={setChoice} />
          </label>
        )}
        {dialog.checkbox && (
          <label className="dialog-checkbox">
            <input type="checkbox" checked={checkboxChecked} onChange={(e) => setCheckboxChecked(e.target.checked)} />
            <span>{dialog.checkbox.label}</span>
          </label>
        )}
        {dialog.text && (
          <label className="field-row">
            <span>{dialog.text.label}</span>
            <TextArea
              autoFocus
              rows={3}
              placeholder={dialog.text.placeholder ?? ''}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <div className="row end wrap">
          <button onClick={cancel}>{dialog.cancelLabel ?? t('Cancelar')}</button>
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
          <button
            autoFocus={!dialog.text}
            className={dialog.danger ? 'primary danger-bg' : 'primary'}
            disabled={confirmDisabled}
            onClick={confirm}
          >
            {dialog.confirmLabel ?? t('Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
