import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';

// liga o modo navegador antes de o setup montar o mock de `src/webview/vscode` (vale para o arquivo inteiro,
// por isso este teste fica separado de dependsOn.test.tsx)
vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

import { seedBoard } from './setup';
import { DependsOn } from '../../src/webview/components/settings/DependsOn';

beforeAll(async () => {
  await seedBoard();
});

describe('DependsOn no navegador', () => {
  it('alvo no Settings do editor: sem link, só o texto do label', () => {
    render(
      <Theme>
        <DependsOn
          label="o Git no modo worktree"
          satisfied={false}
          target={{ kind: 'ideSettings', key: 'fazai.git.mode' }}
          targetHint="no Settings do editor"
        />
      </Theme>,
    );
    expect(screen.getByText(/Depende de/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('alvo no board: continua mostrando o link, mesmo no navegador', () => {
    render(
      <Theme>
        <DependsOn
          label="uma regra de sugestão de modelo"
          satisfied={false}
          target={{ kind: 'board', section: 'model-rules' }}
          targetHint="mais abaixo, nesta mesma aba"
        />
      </Theme>,
    );
    expect(screen.getByRole('button', { name: /Abrir/ })).toBeInTheDocument();
  });
});
