import type { ReactNode } from 'react';
import { Badge, Card, Heading, Text } from '@radix-ui/themes';

/**
 * Cartão de um item das configurações (um arquivo de regras, uma skill, um agente): título, selo opcional,
 * dica, as ações à direita (`actions`) e o conteúdo embaixo. `off` apaga o cartão (item desligado).
 */
export function SettingsCard({
  title,
  badge,
  hint,
  actions,
  off,
  children,
}: {
  title: string;
  badge?: { text: string; on?: boolean };
  hint?: ReactNode;
  actions?: ReactNode;
  off?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className={`settings-card ${off ? 'off' : ''}`} aria-label={title}>
      <div className="settings-card-head">
        <Heading as="h4" size="3">
          {title}
        </Heading>
        {badge && (
          <Badge color={badge.on === false ? 'gray' : 'indigo'} variant={badge.on === false ? 'outline' : 'soft'}>
            {badge.text}
          </Badge>
        )}
        {hint && (
          <Text size="1" color="gray">
            {hint}
          </Text>
        )}
        {actions && <div className="settings-card-actions">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}
