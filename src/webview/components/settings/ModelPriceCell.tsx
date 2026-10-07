import { Button, Text, TextField } from '@radix-ui/themes';
import type { AiTool } from '../../../shared/harness';
import { hasVariablePrice, modelPrice, type ModelOption, type ModelPrice } from '../../../shared/models';
import { PRICE_URLS, builtinPrice, priceIsStale, priceSourceOf } from '../../../shared/prices';
import { t } from '../../i18n';
import { SwitchField } from '../ui';

/** Os quatro campos do preço de um modelo, na ordem em que aparecem na tabela. */
function priceFields(model: string): { key: keyof ModelPrice; caption: string; label: string }[] {
  return [
    { key: 'input', caption: t('entrada'), label: t('Preço de entrada de {model}', { model }) },
    { key: 'output', caption: t('saída'), label: t('Preço de saída de {model}', { model }) },
    { key: 'cacheRead', caption: t('leitura de cache'), label: t('Preço de leitura de cache de {model}', { model }) },
    { key: 'cacheWrite', caption: t('criação de cache'), label: t('Preço de criação de cache de {model}', { model }) },
  ];
}

/** O que está gravado no campo, ou '' quando vazio (vazio é ausência de preço, não zero). */
const priceText = (o: ModelOption, key: keyof ModelPrice): string => {
  const v = o.price?.[key];
  return typeof v === 'number' ? String(v) : '';
};

/** id do campo de preço, para o aviso de modelo sem preço focar o primeiro vazio */
const fieldId = (o: ModelOption, key: keyof ModelPrice) => `price-${o.id}-${key}`;

const ExternalLink = ({ href, children }: { href: string; children: string }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

/**
 * A célula de preço de um modelo na aba Modelos: a chave de preço variável, os quatro campos, de
 * onde veio o preço (embutido com data e fonte, ou manual com o botão de voltar ao embutido), o
 * aviso de preço conferido há tempo demais e o aviso de modelo que vai ficar sem custo.
 */
export function ModelPriceCell({
  model: o,
  tool,
  today,
  onPrice,
  onVariable,
  onRestore,
}: {
  model: ModelOption;
  tool: AiTool;
  today: Date;
  onPrice: (key: keyof ModelPrice, value: number | null) => void;
  onVariable: (on: boolean) => void;
  onRestore: () => void;
}) {
  const variable = hasVariablePrice(o);
  const source = priceSourceOf(o);
  const hasBuiltin = builtinPrice(o.id) !== null;
  const stale = source === 'builtin' && priceIsStale(o.priceCheckedAt ?? '', today);
  const noPrice = !variable && modelPrice(o) === null;
  const fields = priceFields(o.model);
  const focusEmpty = () => {
    const empty = fields.find((f) => priceText(o, f.key) === '') ?? fields[0]!;
    document.getElementById(fieldId(o, empty.key))?.focus();
  };
  return (
    <>
      <div className="price-variable">
        <SwitchField
          label={<span className="small">{t('Preço variável')}</span>}
          title={t('Preço variável de {model}', { model: o.model })}
          checked={variable}
          onChange={onVariable}
        />
      </div>
      {variable ? (
        <Text as="p" size="1" color="gray" className="price-variable-note">
          {tool === 'copilot' ? (
            <>
              {t('O GitHub Copilot cobra por pedido premium, não por token; o board não estima o custo deste modelo.')}{' '}
              <ExternalLink href={PRICE_URLS.copilot}>{t('Preços do Copilot')}</ExternalLink>
            </>
          ) : (
            <>
              {t('O custo depende do modelo escolhido a cada pedido; o board não estima o custo deste modelo.')}{' '}
              {tool === 'cursor' && <ExternalLink href={PRICE_URLS.cursor}>{t('Preços do Cursor')}</ExternalLink>}
            </>
          )}
        </Text>
      ) : (
        <>
          <div className="price-grid">
            {fields.map((f) => (
              <div key={f.key} className="price-field">
                <span className="muted small" aria-hidden="true">
                  {f.caption}
                </span>
                <TextField.Root
                  id={fieldId(o, f.key)}
                  type="number"
                  min="0"
                  step="any"
                  aria-label={f.label}
                  key={`${f.key}:${priceText(o, f.key)}`}
                  defaultValue={priceText(o, f.key)}
                  onBlur={(e) => {
                    const text = e.target.value.trim();
                    const value = text === '' ? null : Number(text);
                    if (value !== null && (!Number.isFinite(value) || value < 0)) {
                      e.target.value = priceText(o, f.key); // número inválido: volta ao que estava gravado
                      return;
                    }
                    if (value !== (o.price?.[f.key] ?? null)) onPrice(f.key, value);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </div>
            ))}
          </div>
          {source === 'builtin' && (
            <Text as="p" size="1" color="gray" className="price-source">
              {t('embutido')}
              {o.priceCheckedAt && <> · {t('conferido em {date}', { date: o.priceCheckedAt })}</>}
              {o.priceUrl && (
                <>
                  {' '}
                  · <ExternalLink href={o.priceUrl}>{t('fonte')}</ExternalLink>
                </>
              )}
            </Text>
          )}
          {source === 'manual' && (
            <Text as="p" size="1" color="gray" className="price-source">
              {t('manual')}
              {hasBuiltin && (
                <>
                  {' '}
                  <Button
                    size="1"
                    variant="ghost"
                    aria-label={t('Voltar ao preço embutido de {model}', { model: o.model })}
                    onClick={onRestore}
                  >
                    {t('Voltar ao preço embutido')}
                  </Button>
                </>
              )}
            </Text>
          )}
          {stale && (
            <Text as="p" size="1" color="orange" className="price-warning" role="status">
              {t('Preços conferidos em {date}', { date: o.priceCheckedAt ?? '' })}
              {o.priceUrl && (
                <>
                  {' '}
                  · <ExternalLink href={o.priceUrl}>{t('conferir agora')}</ExternalLink>
                </>
              )}
            </Text>
          )}
          {noPrice && (
            <Text as="p" size="1" color="orange" className="price-warning" role="status">
              {t('As execuções deste modelo vão ficar sem custo até os quatro preços serem preenchidos.')}{' '}
              <Button size="1" variant="ghost" onClick={focusEmpty}>
                {t('Preencher')}
              </Button>
            </Text>
          )}
        </>
      )}
    </>
  );
}
