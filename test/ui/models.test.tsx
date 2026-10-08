import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { ModelsSettings } from '../../src/webview/components/settings/ModelsSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <ModelsSettings />
    </Theme>,
  );
const state = () => useBoardStore.getState().state!;
const tool = () => state().board.aiTool;

describe('ModelsSettings', () => {
  it('Detectar modelos e Novo modelo ficam no topo; não há linha solta de adicionar', () => {
    show();
    expect(screen.getByRole('button', { name: 'Detectar modelos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('identificador')).toBeNull();
  });

  it('Novo modelo abre o rascunho, com foco no nome, e Adicionar grava na lista', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeDisabled();
    const draft = within(screen.getByLabelText('Modelo novo'));
    expect(draft.getByLabelText('Nome')).toHaveFocus();
    await userEvent.type(draft.getByLabelText('Nome'), 'Teste 9');
    await userEvent.type(draft.getByLabelText('Identificador na ferramenta'), 'teste-9');
    await userEvent.type(draft.getByLabelText('Esforços aceitos'), 'low, high');
    await userEvent.click(draft.getByRole('button', { name: 'Adicionar modelo' }));
    const added = lastSent('settings.models.set').catalog.find((m) => m.model === 'teste-9');
    expect(added).toMatchObject({ tool: tool(), label: 'Teste 9', efforts: ['low', 'high'], defaultEffort: 'low' });
    expect(screen.queryByLabelText('Modelo novo')).toBeNull();
  });

  it('o rascunho recusa um identificador que já existe', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    const draft = within(screen.getByLabelText('Modelo novo'));
    const existing = state().board.modelCatalog.find((m) => m.tool === tool())!;
    await userEvent.type(draft.getByLabelText('Identificador na ferramenta'), existing.model);
    expect(draft.getByRole('button', { name: 'Adicionar modelo' })).toBeDisabled();
    expect(draft.getByText('Já existe um modelo com este identificador.')).toBeInTheDocument();
  });

  it('renomear grava ao sair do campo; o esforço padrão sai do seletor', async () => {
    show();
    const m = state().board.modelCatalog.find((x) => x.tool === tool() && x.efforts.length > 1)!;
    const name = screen.getByLabelText(`Nome de ${m.model}`);
    await userEvent.clear(name);
    await userEvent.type(name, 'Outro nome');
    expect(sentOf('settings.models.set')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.models.set').catalog.find((x) => x.id === m.id)!.label).toBe('Outro nome');
    const other = m.efforts.find((e) => e !== m.defaultEffort)!;
    await choose(screen.getByRole('combobox', { name: `Esforço padrão de ${m.model}` }), other);
    expect(lastSent('settings.models.set').catalog.find((x) => x.id === m.id)!.defaultEffort).toBe(other);
  });

  it('remover tira o modelo do catálogo, sem confirmação', async () => {
    show();
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    await userEvent.click(screen.getByRole('button', { name: `Remover ${m.model} do catálogo` }));
    expect(lastSent('settings.models.set').catalog.some((x) => x.id === m.id)).toBe(false);
  });

  it('Sugestão de modelo: Montar nova regra abre o montador por cima da lista, com os botões no topo', async () => {
    show();
    const build = screen.getByRole('button', { name: 'Montar nova regra' });
    await userEvent.click(build);
    expect(build).toBeDisabled();
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.type(builder.getByLabelText('Nome da regra'), 'Backend pesado');
    await userEvent.click(builder.getByRole('button', { name: 'Adicionar à lista' }));
    expect(lastSent('settings.modelRules.set').rules.at(-1)).toMatchObject({ name: 'Backend pesado', enabled: true });
  });

  it('Montar nova regra: a reserva começa vazia e a regra salva vai sem reserva', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Montar nova regra' }));
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.type(builder.getByLabelText('Nome da regra'), 'Sem reserva');
    const modelTriggers = builder.getAllByRole('combobox', { name: 'Modelo' });
    expect(modelTriggers[1]).toHaveTextContent('—');
    await userEvent.click(builder.getByRole('button', { name: 'Adicionar à lista' }));
    expect(lastSent('settings.modelRules.set').rules.at(-1)).toMatchObject({ name: 'Sem reserva', fallback: null });
  });

  it('Montar nova regra: escolher uma reserva grava o modelo nela', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Montar nova regra' }));
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.type(builder.getByLabelText('Nome da regra'), 'Com reserva');
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    const modelTriggers = builder.getAllByRole('combobox', { name: 'Modelo' });
    await choose(modelTriggers[1]!, m.label);
    await userEvent.click(builder.getByRole('button', { name: 'Adicionar à lista' }));
    expect(lastSent('settings.modelRules.set').rules.at(-1)).toMatchObject({
      name: 'Com reserva',
      fallback: `${m.id}@${m.defaultEffort}`,
    });
  });

  it('editar uma regra existente preserva a reserva já configurada', async () => {
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    board.router.handle({
      type: 'settings.modelRules.set',
      rules: [
        {
          id: 'r2',
          name: 'Teste reserva',
          enabled: true,
          groups: [[{ fieldId: '@type', op: 'is', value: 'História' }]],
          model: m.id,
          fallback: `${m.id}@${m.defaultEffort}`,
        },
      ],
    });
    syncStore(board.router);
    show();
    expect(screen.getByText(new RegExp(`reserva: .*${m.label}`))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.click(builder.getByRole('button', { name: 'Salvar regra' }));
    expect(lastSent('settings.modelRules.set').rules[0]).toMatchObject({ fallback: `${m.id}@${m.defaultEffort}` });
  });

  it('o interruptor liga e desliga uma regra', async () => {
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    board.router.handle({
      type: 'settings.modelRules.set',
      rules: [{ id: 'r1', name: 'Teste', enabled: true, groups: [[{ fieldId: '@type', op: 'is', value: 'História' }]], model: m.id }],
    });
    syncStore(board.router);
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Regra Teste em uso' }));
    expect(lastSent('settings.modelRules.set').rules[0]!.enabled).toBe(false);
  });

  it('a tabela de modelos não tem coluna nem campo de preço', () => {
    show();
    expect(screen.queryByText(/Preço/)).toBeNull();
    expect(screen.queryByLabelText(/^Preço de /)).toBeNull();
  });
});

describe('ModelsSettings: modos rápidos do Cursor', () => {
  it('a chave só aparece no Cursor e grava a regra', async () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Incluir os modos rápidos' })).toBeNull();
    board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
    syncStore(board.router);
    show();
    const toggle = screen.getAllByRole('switch', { name: 'Incluir os modos rápidos' }).at(-1)!;
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { includeFastModels: true } });
    board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude' } });
  });
});

describe('regras de modelo em inglês', () => {
  it('os nomes do board padrão nas regras saem traduzidos: o campo, as opções e o nome das regras', async () => {
    const { ModelRulesEditor } = await import('../../src/webview/components/settings/ModelRulesEditor');
    const { setLocale } = await import('../../src/webview/i18n');
    const seeded = await seedBoard();
    seeded.router.handle({ type: 'settings.modelRules.suggest', tool: 'claude' });
    syncStore(seeded.router);
    setLocale('en');
    try {
      render(
        <Theme>
          <ModelRulesEditor />
        </Theme>,
      );
      expect(screen.getByText('Task effort low')).toBeInTheDocument();
      expect(screen.getByText('Task effort = Low')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recreate the "Task effort" rules' })).toBeInTheDocument();
    } finally {
      setLocale('pt-BR');
    }
  });
});
