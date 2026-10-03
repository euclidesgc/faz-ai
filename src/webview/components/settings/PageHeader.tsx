import type { ReactNode } from 'react';

/**
 * Topo de cada aba das configurações: título à esquerda, a ação principal da aba à direita (`actions`)
 * e, abaixo, a descrição (`children`). Mantém todas as abas com o mesmo alinhamento.
 */
export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <h2>{title}</h2>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {children && <p className="muted page-desc">{children}</p>}
    </header>
  );
}
