import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Popover, TextField } from '@radix-ui/themes';
import { t } from '../i18n';

export interface PickerOption {
  value: string;
  label: string;
}
export interface PickerGroup {
  key: string;
  label: string;
  options: PickerOption[];
}

/** Compara sem caixa nem acento: "gemini pro" acha "Gemini · Pró". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Um seletor com as opções agrupadas (um grupo por agente) e um campo para filtrar pelo nome: o Select do
 * Radix não deixa digitar para procurar, e um catálogo com dezenas de modelos exige isso. O gatilho é um
 * `combobox`, as opções são `option`: os mesmos papéis do Select, para quem lê a tela e para os testes.
 * `head` são as opções fora dos grupos ("—", "Qualquer modelo"), sempre antes e nunca filtradas fora quando
 * o filtro está vazio.
 */
export function GroupedPicker({
  id,
  ariaLabel,
  value,
  head = [],
  groups,
  onChange,
  placeholder,
}: {
  id?: string;
  ariaLabel?: string;
  value: string;
  head?: PickerOption[];
  groups: PickerGroup[];
  onChange(value: string): void;
  placeholder?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) setFilter('');
  }, [open]);
  const current = useMemo(() => [...head, ...groups.flatMap((g) => g.options)].find((o) => o.value === value), [head, groups, value]);
  const needle = fold(filter.trim());
  const matches = (o: PickerOption, group?: string) => !needle || fold(`${group ?? ''} ${o.label}`).includes(needle);
  const visibleHead = head.filter((o) => matches(o));
  const visibleGroups = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => matches(o, g.label)) }))
    .filter((g) => g.options.length);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const first = visibleHead[0] ?? visibleGroups[0]?.options[0];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          id={id}
          type="button"
          variant="surface"
          color="gray"
          className="picker-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
        >
          <span className="picker-trigger-label">{current?.label ?? placeholder ?? value}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        className="picker-content"
        size="1"
        align="start"
        onOpenAutoFocus={(e) => (e.preventDefault(), input.current?.focus())}
      >
        <TextField.Root
          ref={input}
          size="1"
          placeholder={t('Digite para filtrar')}
          aria-label={t('Filtrar opções')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) {
              e.preventDefault();
              pick(first.value);
            }
          }}
        />
        <div role="listbox" className="picker-list">
          {visibleHead.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className="picker-option"
              onClick={() => pick(o.value)}
            >
              {o.label}
            </button>
          ))}
          {visibleGroups.map((g) => (
            <div key={g.key} role="group" aria-labelledby={`${uid}-${g.key}`} className="picker-group">
              <div id={`${uid}-${g.key}`} className="picker-group-label">
                {g.label}
              </div>
              {g.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className="picker-option"
                  onClick={() => pick(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          {!visibleHead.length && !visibleGroups.length && <p className="muted picker-empty">{t('Nada com esse nome.')}</p>}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
