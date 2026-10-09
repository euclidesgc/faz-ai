import { lastSent, seedBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { DependsOn } from '../../src/webview/components/settings/DependsOn';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeAll(async () => {
  await seedBoard();
});

const showBoardTarget = (satisfied: boolean, state?: string) =>
  render(
    <Theme>
      <DependsOn
        label="uma regra de sugestão de modelo"
        state={state}
        satisfied={satisfied}
        target={{ kind: 'board', section: 'model-rules' }}
        targetHint="mais abaixo, nesta mesma aba"
      />
    </Theme>,
  );

describe('DependsOn', () => {
  it('satisfeito: sem a classe de aviso, e o link "abrir" tem o aria-label completo', () => {
    showBoardTarget(true);
    const p = screen.getByText(/Depende de/).closest('p')!;
    expect(p).toHaveClass('depends-on');
    expect(p).not.toHaveClass('depends-on-unmet');
    expect(screen.getByRole('button', { name: 'Abrir uma regra de sugestão de modelo, mais abaixo, nesta mesma aba' })).toBeInTheDocument();
  });

  it('não satisfeito: tem a classe de aviso, e mostra "(agora: …)" quando state é passado', () => {
    showBoardTarget(false, 'Desligado');
    const p = screen.getByText(/Depende de/).closest('p')!;
    expect(p).toHaveClass('depends-on-unmet');
    expect(p).toHaveTextContent('Depende de uma regra de sugestão de modelo (agora: Desligado)');
  });

  it('sem state, não mostra "(agora: …)"', () => {
    showBoardTarget(true);
    const p = screen.getByText(/Depende de/).closest('p')!;
    expect(p).not.toHaveTextContent('agora:');
  });

  it('alvo no board: clicar em "abrir" troca a aba (e a sub-aba de Harness) conforme SETTINGS_SECTIONS', async () => {
    useBoardStore.setState({ settingsTab: 'columns', pendingSettingsSection: null });
    render(
      <Theme>
        <DependsOn
          label="ferramenta Cursor"
          satisfied={false}
          target={{ kind: 'board', section: 'harness-tool' }}
          targetHint="em Harness de IA"
        />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Abrir/ }));
    const s = useBoardStore.getState();
    expect(s.settingsTab).toBe('harness');
    expect(s.harnessTab).toBe('tool');
    expect(s.pendingSettingsSection).toBe('harness-tool');
  });

  it('alvo no Settings do editor: clicar manda ui.openIdeSettings com a chave', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: /Abrir/ }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.git.mode' });
  });
});
