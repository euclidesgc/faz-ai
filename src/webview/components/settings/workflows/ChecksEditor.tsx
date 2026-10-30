import { useState } from 'react';
import { TextField } from '@radix-ui/themes';
import type { Column, ColumnCheck } from '../../../../shared/model';
import { CHECK_TIMEOUT_DEFAULT, CHECK_TIMEOUT_MAX, CHECK_TIMEOUT_MIN, columnChecksError } from '../../../../shared/columnChecks';
import { settings } from '../../../commands';
import { ActionButton, ActionIconButton, DeleteButton, FormField, IconArrowDown, IconArrowUp, IconPlus, NumberField } from '../../ui';
import { t } from '../../../i18n';

/** Aviso da linha cujo campo ficou vazio: o campo volta ao valor gravado e o motivo fica à vista. */
type RowError = { index: number; message: string };

/**
 * As checagens de uma coluna: comandos que o board roda na pasta da história quando a IA tenta tirar o card da
 * coluna para a frente. Cada mudança grava a lista inteira (reordenar e remover ficam atômicos).
 */
export function ChecksEditor({ column }: { column: Column }) {
  const checks = column.checks;
  const [error, setError] = useState<RowError | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(CHECK_TIMEOUT_DEFAULT);

  const save = (next: ColumnCheck[]) => settings.updateColumn(column.id, { checks: next });
  const change = (index: number, patch: Partial<ColumnCheck>) => {
    setError(null);
    save(checks.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const swap = (a: number, b: number) => {
    const next = [...checks];
    [next[a], next[b]] = [next[b]!, next[a]!];
    setError(null);
    save(next);
  };
  // texto vazio não grava: o campo volta ao valor gravado e a linha diz por quê
  const commitText = (index: number, field: 'name' | 'command', input: HTMLInputElement) => {
    const value = input.value.trim();
    const current = checks[index]![field];
    if (value === current) return;
    const message = columnChecksError([{ ...checks[index]!, [field]: value }]);
    if (message) {
      input.value = current;
      setError({ index, message: t(message) });
      return;
    }
    change(index, { [field]: value });
  };

  const draft: ColumnCheck = { name: name.trim(), command: command.trim(), timeoutSec };
  const draftError = columnChecksError([draft]);
  const add = () => {
    if (draftError) return;
    save([...checks, draft]);
    setName('');
    setCommand('');
    setTimeoutSec(CHECK_TIMEOUT_DEFAULT);
  };

  return (
    <div className="phase-editor checks-editor">
      <FormField
        label={t('Checagens da coluna')}
        hint={t(
          'O board vai rodar estes comandos na pasta da história quando a IA tirar o card de "{name}" para a frente (numa próxima versão). Aceitam {base} e {changed_files}.',
          { name: column.name },
        )}
      >
        {() => (
          <ol className="checks-list">
            {checks.map((c, i) => (
              <li key={`${i}-${c.name}-${c.command}`} className="check-row">
                <TextField.Root
                  aria-label={t('Nome da checagem {n}', { n: i + 1 })}
                  defaultValue={c.name}
                  placeholder={t('Ex.: Tipos')}
                  onBlur={(e) => commitText(i, 'name', e.target)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <TextField.Root
                  aria-label={t('Comando da checagem {n}', { n: i + 1 })}
                  defaultValue={c.command}
                  placeholder={t('Ex.: npm run typecheck')}
                  onBlur={(e) => commitText(i, 'command', e.target)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <NumberField
                  aria-label={t('Tempo limite da checagem {n}', { n: i + 1 })}
                  value={c.timeoutSec}
                  min={CHECK_TIMEOUT_MIN}
                  max={CHECK_TIMEOUT_MAX}
                  unit="s"
                  onCommit={(v) => change(i, { timeoutSec: Math.round(v) })}
                />
                <div className="row-actions">
                  <ActionIconButton
                    variant="ghost"
                    color="gray"
                    size="1"
                    hint={t('Rodar antes')}
                    aria-label={t('Subir a checagem {n}', { n: i + 1 })}
                    disabled={i === 0}
                    onClick={() => swap(i, i - 1)}
                  >
                    <IconArrowUp />
                  </ActionIconButton>
                  <ActionIconButton
                    variant="ghost"
                    color="gray"
                    size="1"
                    hint={t('Rodar depois')}
                    aria-label={t('Descer a checagem {n}', { n: i + 1 })}
                    disabled={i === checks.length - 1}
                    onClick={() => swap(i, i + 1)}
                  >
                    <IconArrowDown />
                  </ActionIconButton>
                  <DeleteButton
                    title={t('Excluir a checagem')}
                    aria-label={t('Excluir a checagem {n}', { n: i + 1 })}
                    question={t('Excluir a checagem "{name}"?', { name: c.name })}
                    confirmLabel={t('Excluir checagem')}
                    onConfirm={() => save(checks.filter((_, j) => j !== i))}
                  />
                </div>
                {error?.index === i && (
                  <p role="alert" className="form-error check-row-error">
                    {error.message}
                  </p>
                )}
              </li>
            ))}
            <li className="check-row">
              <TextField.Root
                aria-label={t('Nome da nova checagem')}
                value={name}
                placeholder={t('Ex.: Tipos')}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField.Root
                aria-label={t('Comando da nova checagem')}
                value={command}
                placeholder={t('Ex.: npm run typecheck')}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <NumberField
                aria-label={t('Tempo limite da nova checagem')}
                value={timeoutSec}
                min={CHECK_TIMEOUT_MIN}
                max={CHECK_TIMEOUT_MAX}
                unit="s"
                onCommit={(v) => setTimeoutSec(Math.round(v))}
              />
              <div className="row-actions">
                <ActionButton
                  size="1"
                  hint={t('Acrescenta a checagem ao fim da lista')}
                  disabledReason={draftError ? t(draftError) : null}
                  disabled={!!draftError}
                  onClick={add}
                >
                  <IconPlus /> {t('Adicionar checagem')}
                </ActionButton>
              </div>
            </li>
          </ol>
        )}
      </FormField>
    </div>
  );
}
