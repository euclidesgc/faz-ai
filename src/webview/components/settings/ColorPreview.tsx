import { badgeContrast, badgeStyle, readableVariants } from '../../../shared/color';
import { CardBar } from '../cardView/CardBar';
import { IconWarning } from '../ui';
import { t } from '../../i18n';

/** Como o card fica com a cor do tipo: a barra de verdade (mesmo componente do board) e um título de exemplo. */
export function CardPreview({ typeName, color }: { typeName: string; color: string }) {
  return (
    <div className="card card-preview" aria-label={t('Prévia do card do tipo {typeName}', { typeName })}>
      <CardBar id="#12" typeName={typeName} color={color} />
      <div className="card-body">
        <div className="card-title">{t('Título do card')}</div>
      </div>
    </div>
  );
}

/**
 * Aviso quando o texto sobre a cor fica difícil de ler, com as variantes mais próximas da mesma cor
 * (uma mais escura, uma mais clara) que resolvem; um clique aplica. Não mostra nada se a cor já está boa.
 */
export function ContrastHint({ color, onPick }: { color: string; onPick: (color: string) => void }) {
  if (!badgeContrast(color).low) return null;
  const variants = readableVariants(color);
  return (
    <div className="contrast-hint" role="status">
      <IconWarning />
      <span>{t('Texto difícil de ler nesta cor.')}</span>
      {variants.length > 0 && <span className="muted">{t('Sugestões:')}</span>}
      {variants.map((v) => (
        <button
          key={v}
          type="button"
          className="contrast-swatch"
          style={badgeStyle(v)}
          title={t('Usar {color}', { color: v })}
          onClick={() => onPick(v)}
        >
          Aa
        </button>
      ))}
    </div>
  );
}
