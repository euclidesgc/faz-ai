import type { ReactNode } from 'react';
import { badgeStyle } from '../../../shared/color';
import { AiLed } from './AiLed';

/**
 * Faixa colorida do topo do card: fundo na cor do tipo e texto preto ou branco pelo contraste, com o
 * LED da IA, o ID e o nome do tipo; `children` vai à direita (os botões). Também desenha a prévia em
 * Configurações > Tipos, por isso não depende de um card de verdade.
 */
export function CardBar({
  id,
  typeName,
  color,
  working = false,
  children,
}: {
  id: string;
  typeName?: string;
  color?: string;
  working?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="card-bar" style={badgeStyle(color)}>
      {working && <AiLed />}
      <span className="card-id" title="ID do card">
        {id}
      </span>
      <span className="card-type" title={typeName}>
        {typeName}
      </span>
      {children}
    </div>
  );
}
