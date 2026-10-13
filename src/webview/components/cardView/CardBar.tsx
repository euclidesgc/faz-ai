import type { ReactNode } from 'react';
import { badgeStyle } from '../../../shared/color';
import { t } from '../../i18n';
import type { CardStatus } from '../../../shared/status';
import { AiLed, type AiWork } from './AiLed';

/**
 * Faixa colorida do topo do card: fundo na cor do tipo e texto preto ou branco pelo contraste, com o
 * LED da IA (sempre presente), o ID e o nome do tipo; `children` vai à direita (os botões). Também desenha a prévia em
 * Configurações > Tipos, por isso não depende de um card de verdade.
 */
export function CardBar({
  id,
  typeName,
  color,
  work = null,
  status = null,
  leading,
  children,
}: {
  id: string;
  typeName?: string;
  color?: string;
  work?: AiWork;
  status?: CardStatus | null;
  /** vai antes do LED, na mesma faixa: a caixa de seleção múltipla do card */
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card-bar" style={badgeStyle(color)}>
      {leading}
      <AiLed work={work} status={status} />
      <span className="card-id" title={t('ID do card')}>
        {id}
      </span>
      <span className="card-type" title={typeName}>
        {typeName}
      </span>
      {children}
    </div>
  );
}
