import { Tooltip } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

/**
 * Tooltip rico sobre um botão (ou outro trigger focável): abre no hover e no foco, fecha no Esc.
 * `disabledReason`, se vier, substitui `content` e garante que o hint continue acessível mesmo
 * com o trigger desabilitado (um `<button disabled>` não dispara hover/focus em todos os
 * navegadores, por isso o wrapper `<span tabIndex={0}>` abaixo).
 */
export function Hint({
  content,
  disabledReason,
  children,
}: {
  content: ReactNode;
  disabledReason?: string | null;
  children: ReactElement<{ disabled?: boolean }>;
}) {
  const body = disabledReason ?? content;
  const trigger = disabledReason ? (
    <span tabIndex={0} className="hint-disabled-wrap">
      {children}
    </span>
  ) : (
    children
  );
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="hint-content" sideOffset={6} collisionPadding={8}>
            {body}
            <Tooltip.Arrow className="hint-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
