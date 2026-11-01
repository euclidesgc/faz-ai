import { useState } from 'react';
import { Button, Card, Text, TextField } from '@radix-ui/themes';
import { COST_BUCKETS, parsePricing, type CostBucket, type ModelPricing as Pricing } from '../../../../shared/cost';
import type { ModelOption } from '../../../../shared/models';
import { t } from '../../../i18n';
import { FormField } from '../../ui';

/** Os rótulos dos quatro buckets; o português é a chave e é traduzido onde é usado. */
const LABELS: Record<CostBucket, string> = {
  input: 'Entrada',
  output: 'Saída',
  cacheRead: 'Leitura de cache',
  cacheWrite: 'Escrita de cache',
};

/** Texto do campo -> número (>= 0), null (vazio: sem preço) ou undefined (inválido). */
export function parsePrice(text: string): number | null | undefined {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Os quatro preços (US$ por milhão de tokens) de um modelo do catálogo. Campo vazio = sem preço, nunca 0. */
export function ModelPricing({
  option,
  onSave,
  onDone,
}: {
  option: ModelOption;
  onSave: (pricing: Pricing | undefined) => void;
  onDone: () => void;
}) {
  const current = parsePricing(option.pricing) ?? {};
  const [draft, setDraft] = useState<Record<CostBucket, string>>(
    () =>
      Object.fromEntries(COST_BUCKETS.map((b) => [b, current[b] === undefined ? '' : String(current[b])])) as Record<CostBucket, string>,
  );
  const invalid = (b: CostBucket) => parsePrice(draft[b]) === undefined;
  const valid = COST_BUCKETS.every((b) => !invalid(b));
  const save = () => {
    if (!valid) return;
    const pricing: Pricing = {};
    for (const b of COST_BUCKETS) {
      const v = parsePrice(draft[b]);
      if (v !== null && v !== undefined) pricing[b] = v;
    }
    onSave(Object.keys(pricing).length ? pricing : undefined);
    onDone();
  };
  return (
    <Card className="draft-card" aria-label={t('Preço de {model}', { model: option.model })}>
      <div className="form-grid">
        {COST_BUCKETS.map((b) => (
          <FormField
            key={b}
            label={t(LABELS[b])}
            hint={invalid(b) ? t('Informe um número maior ou igual a zero, ou deixe vazio.') : undefined}
          >
            {(id) => (
              <TextField.Root
                id={id}
                inputMode="decimal"
                value={draft[b]}
                color={invalid(b) ? 'red' : undefined}
                placeholder={t('sem preço')}
                onChange={(e) => setDraft({ ...draft, [b]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') onDone();
                }}
              />
            )}
          </FormField>
        ))}
      </div>
      <Text as="p" size="1" color="gray">
        {t('US$ por milhão de tokens. Campo vazio = sem preço. O preço vale da próxima execução em diante.')}
      </Text>
      <Text as="p" size="1" color="gray">
        {t('Preço informado por você; o board não confere com o provedor.')}
      </Text>
      <div className="form-actions">
        <Button variant="soft" color="gray" onClick={onDone}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!valid} onClick={save}>
          {t('Salvar preço')}
        </Button>
      </div>
    </Card>
  );
}
