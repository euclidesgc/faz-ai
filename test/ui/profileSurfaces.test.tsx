import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { seedBoard, syncStore, lastSent } from './setup';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { ModelEditor } from '../../src/webview/components/FieldRenderer';
import { AgentModels } from '../../src/webview/components/settings/agentConnect/AgentModels';
import type { AiProfile } from '../../src/shared/aiProfiles';

const custom: AiProfile = {
  id: 'local-cli',
  name: 'CLI local',
  enabled: true,
  kind: 'custom',
  tool: 'local-cli',
  mode: 'cli',
  base: 'generic',
  config: {},
  position: 3,
};

beforeEach(async () => {
  const seeded = await seedBoard();
  syncStore(seeded.router);
  const state = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: { ...state, board: { ...state.board, aiTool: custom.id, aiProfiles: [...state.board.aiProfiles, custom] } },
  });
});

describe('Superfícies de perfis de CLI', () => {
  it('os modelos do agente personalizado se cadastram à mão, sem oferecer detecção', async () => {
    render(
      <Theme>
        <AgentModels profile={custom} />
      </Theme>,
    );
    expect(screen.queryByRole('button', { name: 'Detectar modelos' })).toBeNull();
    expect(screen.getByText('Nenhum modelo. Use "Novo modelo" para cadastrar à mão.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    const draft = within(screen.getByLabelText('Modelo novo'));
    await userEvent.type(draft.getByLabelText('Identificador na ferramenta'), 'modelo-local');
    await userEvent.click(draft.getByRole('button', { name: 'Adicionar modelo' }));
    expect(lastSent('settings.models.set').catalog).toContainEqual(
      expect.objectContaining({ id: 'local-cli:modelo-local', tool: 'local-cli' }),
    );
  });

  it('Outro modelo grava identificador do perfil custom sem exigir cadastro', async () => {
    let value: unknown;
    render(
      <Theme>
        <ModelEditor
          value={null}
          onChange={(next) => {
            value = next;
          }}
          part="model"
        />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Outro modelo…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Outro modelo' }), 'modelo-avulso{Enter}');
    expect(value).toBe('local-cli:modelo-avulso');
  });

  it('num perfil ACP, os modelos do agente oferecem Detectar modelos: a lista vem da sessão do agente', async () => {
    const acp: AiProfile = {
      ...custom,
      id: 'gemini-acp',
      tool: 'gemini-acp',
      mode: 'acp',
      name: 'Gemini ACP',
      config: { acpAgent: 'gemini' },
      position: 4,
    };
    const state = useBoardStore.getState().state!;
    useBoardStore.setState({
      state: { ...state, board: { ...state.board, aiTool: acp.id, aiProfiles: [...state.board.aiProfiles, acp] } },
    });
    render(
      <Theme>
        <AgentModels profile={acp} />
      </Theme>,
    );
    expect(screen.getByText('Nenhum modelo. Use "Detectar modelos" ou "Novo modelo".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Detectar modelos' }));
    expect(lastSent('settings.models.detect')).toMatchObject({ tool: 'gemini-acp' });
  });

  it('o perfil personalizado aparece no campo Modelo mesmo sem modelo cadastrado e sem ser o padrão', async () => {
    const state = useBoardStore.getState().state!;
    // o padrão volta a ser o Claude: o personalizado tem de aparecer por estar ligado, não por ser o padrão
    useBoardStore.setState({ state: { ...state, board: { ...state.board, aiTool: 'claude' } } });
    let value: unknown;
    render(
      <Theme>
        <ModelEditor
          value={null}
          onChange={(next) => {
            value = next;
          }}
          part="model"
        />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('CLI local')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'Outro modelo…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Outro modelo' }), 'gemini-3-pro{Enter}');
    expect(value).toBe('local-cli:gemini-3-pro');
  });
});
