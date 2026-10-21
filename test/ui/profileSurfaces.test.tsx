import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { seedBoard, syncStore, lastSent } from './setup';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { ModelEditor } from '../../src/webview/components/FieldRenderer';
import { ModelsSettings } from '../../src/webview/components/settings/ModelsSettings';
import { ProjectTool } from '../../src/webview/components/settings/harness/ProjectTool';
import { toolInfo, type AiProfile } from '../../src/shared/aiProfiles';

const custom: AiProfile = {
  id: 'local-cli',
  name: 'CLI local',
  enabled: true,
  kind: 'custom',
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
  it('Harness lista o perfil custom com caminhos indisponíveis e envia a troca de executor', async () => {
    render(
      <Theme>
        <ProjectTool tool={toolInfo(custom)} />
      </Theme>,
    );
    const row = screen.getByRole('row', { name: /CLI local/ });
    expect(within(row).getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('Instalar MCP')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Claude Code' }));
    expect(lastSent('settings.board.update')).toMatchObject({ patch: { aiTool: 'claude' } });
  });

  it('Modelos de IA permite cadastrar no catálogo custom, sem oferecer detecção', async () => {
    render(
      <Theme>
        <ModelsSettings />
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
});
