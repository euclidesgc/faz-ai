import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { seedBoard } from './setup';
import { HarnessSettings } from '../../src/webview/components/settings/HarnessSettings';
import { resolveHarnessTab } from '../../src/shared/harnessTopics';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeEach(async () => {
  await seedBoard();
});

const renderScreen = () =>
  render(
    <Theme>
      <HarnessSettings />
    </Theme>,
  );

describe('HarnessSettings: abas', () => {
  it('tem duas abas, sem uma por ferramenta, e abre a de ferramenta e execução', async () => {
    useBoardStore.setState({ harnessTab: 'tool' });
    renderScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /^Ferramenta e execução/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /^Claude Code/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /^Artefatos do board/ }));
    for (const name of ['Regras', 'Skills', 'Agentes', 'Servidores MCP'])
      expect(screen.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Global' })).toBeNull();
  });

  it('um valor antigo persistido cai na aba de ferramenta', () => {
    expect(resolveHarnessTab('claude')).toBe('tool');
    expect(resolveHarnessTab('cursor')).toBe('tool');
    expect(resolveHarnessTab(null)).toBe('tool');
    expect(resolveHarnessTab('artifacts')).toBe('artifacts');
  });
});
