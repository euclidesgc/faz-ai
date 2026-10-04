import { seedBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { SkillPicker } from '../../src/webview/components/skills/SkillPicker';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { HarnessItem } from '../../src/shared/harness';

const item = (name: string, scope: HarnessItem['scope'], description: string, plugin?: string): HarnessItem => ({
  kind: 'skill',
  scope,
  name,
  description,
  path: `/abs/${name}/SKILL.md`,
  location: `${name}/SKILL.md`,
  layout: 'skills',
  mode: 'auto',
  plugin,
});

beforeEach(async () => {
  await seedBoard();
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: {
      ...s,
      board: { ...s.board, aiTool: 'claude' },
      harness: {
        ...s.harness,
        skills: [],
        inventory: [
          {
            tool: 'claude',
            installed: true,
            items: [
              item('revisar-spec', 'project', 'Revisa uma Spec e aponta lacunas antes do Plan'),
              item('humanizer', 'user', 'Remove signs of AI-generated writing'),
              item('pdf', 'plugin', 'Extrai texto de arquivos PDF', 'docs'),
            ],
          },
        ],
      },
    },
  });
});

function Harness({ intent }: { intent?: string }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <Theme>
      <SkillPicker value={value} onChange={setValue} intent={intent} />
      <output aria-label="valor">{value.join(',')}</output>
    </Theme>
  );
}
const dialog = () => within(screen.getByRole('dialog'));

describe('SkillPicker', () => {
  it('resumo vazio; a janela lista as skills com a origem e marca por caixa de seleção', async () => {
    render(<Harness />);
    expect(screen.getByText('Nenhuma skill.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Escolher skills (3)' }));
    const list = dialog().getByRole('list', { name: 'Skills' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    // a origem de cada uma: projeto, global ou o nome do plugin
    expect(within(list).getByText('projeto')).toBeInTheDocument();
    expect(within(list).getByText('global')).toBeInTheDocument();
    expect(within(list).getByText('docs')).toBeInTheDocument();
    await userEvent.click(dialog().getByRole('checkbox', { name: 'humanizer' }));
    expect(screen.getByLabelText('valor')).toHaveTextContent('humanizer');
    expect(dialog().getByText('1 marcadas')).toBeInTheDocument();
  });

  it('busca pelo nome ou pela descrição e filtra pela aba de origem', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Escolher skills (3)' }));
    await userEvent.type(dialog().getByLabelText('Buscar skill'), 'pdf');
    expect(within(dialog().getByRole('list', { name: 'Skills' })).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.clear(dialog().getByLabelText('Buscar skill'));
    await userEvent.click(dialog().getByRole('radio', { name: /Projeto/ }));
    expect(within(dialog().getByRole('list', { name: 'Skills' })).getByText('revisar-spec')).toBeInTheDocument();
    expect(dialog().queryByText('humanizer')).toBeNull();
  });

  it('a intenção sugere skills e marca todas as sugeridas; Limpar desmarca', async () => {
    render(<Harness intent="revisar a spec e apontar lacunas" />);
    await userEvent.click(screen.getByRole('button', { name: /Sugerir pela intenção/ }));
    expect(within(dialog().getByRole('list', { name: 'Skills' })).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(dialog().getByRole('checkbox', { name: 'revisar-spec' }));
    expect(screen.getByLabelText('valor')).toHaveTextContent('revisar-spec');
    await userEvent.click(dialog().getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.getByLabelText('valor')).toHaveTextContent('');
    await userEvent.click(dialog().getByRole('button', { name: 'Aplicar seleção' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o resumo mostra poucas marcadas por nome e o resto como +N', async () => {
    function Many() {
      const [value, setValue] = useState(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
      return (
        <Theme>
          <SkillPicker value={value} onChange={setValue} />
        </Theme>
      );
    }
    render(<Many />);
    expect(screen.getByText('a5')).toBeInTheDocument();
    expect(screen.queryByText('a6')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+2' }));
    // as marcadas que não existem mais no disco continuam à vista, para poderem ser desmarcadas
    expect(within(dialog().getByRole('list', { name: 'Skills' })).getAllByRole('listitem')).toHaveLength(7);
  });
});
