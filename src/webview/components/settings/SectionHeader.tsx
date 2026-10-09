import type { ReactNode } from 'react';
import { Badge, Heading } from '@radix-ui/themes';

/**
 * Título de uma seção dentro de uma aba (o `PageHeader` é o da aba): nome, contagem opcional, a ação da seção
 * à direita (`actions`) e a descrição embaixo (`children`).
 */
export function SectionHeader({
  id,
  title,
  count,
  actions,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header id={id} className="section-header">
      <div className="section-header-row">
        <Heading as="h3" size="4">
          {title}
        </Heading>
        {count !== undefined && (
          <Badge color="gray" variant="soft">
            {count}
          </Badge>
        )}
        {actions && <div className="section-header-actions">{actions}</div>}
      </div>
      {children && <div className="muted small section-desc">{children}</div>}
    </header>
  );
}
