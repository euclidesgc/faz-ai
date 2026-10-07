import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';

// liga o modo navegador antes de o setup montar o mock de `src/webview/vscode` (vale para o arquivo inteiro,
// por isso este teste fica separado de settings.test.tsx)
vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

import { seedBoard } from './setup';
import { Settings } from '../../src/webview/components/settings/Settings';

beforeAll(async () => {
  await seedBoard();
});

describe('Settings no navegador', () => {
  it('não mostra o botão "Abrir no Settings do editor"', () => {
    render(
      <Theme>
        <Settings />
      </Theme>,
    );
    expect(screen.queryByRole('button', { name: 'Abrir no Settings do editor' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Verificar ambiente' })).toBeInTheDocument();
  });
});
