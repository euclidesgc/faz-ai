import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { ModelsSettings } from '../../src/webview/components/settings/ModelsSettings';
import { modelPrice, type ModelOption } from '../../src/shared/models';
import { PRICE_URLS } from '../../src/shared/prices';
import { AI_TOOLS } from '../../src/shared/harness';
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

  describe('preço por milhão de tokens', () => {
    // um modelo fora da tabela embutida: os campos mostram o que está no catálogo, e vazio continua vazio
    const semTabela = (): ModelOption => ({
      id: `${tool()}:sem-tabela`,
      tool: tool(),
      model: 'sem-tabela',
      label: 'Sem tabela',
      efforts: [],
      defaultEffort: null,
    });
    const mine = () => state().board.modelCatalog.find((x) => x.id === semTabela().id)!;
    const field = (kind: string) => screen.getByLabelText(`Preço de ${kind} de ${mine().model}`) as HTMLInputElement;
    const saved = (): ModelOption => lastSent('settings.models.set').catalog.find((x) => x.id === mine().id)!;
    /** O host aplica o que a tela mandou e devolve o estado novo, como no uso real. */
    const applyLast = () => {
      board.router.handle(lastSent('settings.models.set'));
      syncStore(board.router);
    };
    const setPrices = (price: ModelOption['price']) => {
      const others = state().board.modelCatalog.filter((o) => o.id !== semTabela().id);
      const catalog = [...others, price ? { ...semTabela(), price } : semTabela()];
      board.router.handle({ type: 'settings.models.set', catalog });
      syncStore(board.router);
    };
    beforeEach(() => setPrices(undefined));

    it('os quatro campos mostram o que está no catálogo: sem preço gravado, ficam vazios', () => {
      show();
      expect(screen.getByText('Preço (US$ por milhão de tokens)')).toBeInTheDocument();
      for (const kind of ['entrada', 'saída', 'leitura de cache', 'criação de cache']) {
        expect(field(kind)).toHaveValue(null);
      }
      expect(screen.getByText(/O custo informado pela ferramenta tem preferência/)).toBeInTheDocument();
    });

    it('os modelos embutidos já vêm com preço, origem embutida e o link da fonte', () => {
      show();
      const embutido = state().board.modelCatalog.find((x) => x.tool === tool() && x.priceSource === 'builtin')!;
      expect(embutido.price).toBeDefined();
      expect(screen.getByLabelText(`Preço de entrada de ${embutido.model}`)).toHaveValue(embutido.price!.input!);
      expect(screen.getAllByRole('link', { name: 'fonte' })[0]).toHaveAttribute('href', embutido.priceUrl);
    });

    it('editar um campo de um modelo embutido grava o modelo como manual, sem data de conferência', async () => {
      show();
      const embutido = state().board.modelCatalog.find((x) => x.tool === tool() && x.priceSource === 'builtin')!;
      const input = screen.getByLabelText(`Preço de saída de ${embutido.model}`);
      await userEvent.clear(input);
      await userEvent.type(input, '99');
      await userEvent.tab();
      const sent = lastSent('settings.models.set').catalog.find((x) => x.id === embutido.id)!;
      expect(sent).toMatchObject({ priceSource: 'manual', price: { ...embutido.price, output: 99 } });
      expect(sent.priceCheckedAt).toBeUndefined();
      expect(sent.priceUrl).toBeUndefined();
      // e o botão de voltar devolve o embutido
      applyLast();
      await userEvent.click(await screen.findByRole('button', { name: `Voltar ao preço embutido de ${embutido.model}` }));
      expect(lastSent('settings.models.set').catalog.find((x) => x.id === embutido.id)).toMatchObject({
        priceSource: 'builtin',
        price: embutido.price,
      });
    });

    it('o rodapé tem o link de preços da ferramenta do board', () => {
      show();
      const label = AI_TOOLS.find((tl) => tl.id === tool())!.label;
      expect(screen.getByRole('link', { name: `Preços de ${label}` })).toHaveAttribute('href', PRICE_URLS[tool()]);
    });

    it('um número digitado grava ao sair do campo e reaparece quando a tela relê o catálogo', async () => {
      show();
      await userEvent.type(field('entrada'), '15.5');
      expect(sentOf('settings.models.set')).toHaveLength(0);
      await userEvent.tab();
      expect(saved().price).toEqual({ input: 15.5 });
      applyLast();
      expect(field('entrada')).toHaveValue(15.5);
    });

    it('preencher só um campo não vira preço válido; os quatro viram, e zero é preço', async () => {
      show();
      await userEvent.type(field('entrada'), '3');
      await userEvent.tab();
      expect(modelPrice(saved())).toBeNull();

      for (const [kind, value] of [
        ['saída', '15'],
        ['leitura de cache', '0.3'],
        ['criação de cache', '0'],
      ] as const) {
        applyLast();
        await userEvent.type(field(kind), value);
        await userEvent.tab();
      }
      expect(modelPrice(saved())).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 });
    });

    it('esvaziar um campo apaga só aquele preço (ausência, não zero)', async () => {
      setPrices({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
      show();
      await userEvent.clear(field('saída'));
      await userEvent.tab();
      expect(saved().price).toEqual({ input: 3, cacheRead: 0.3, cacheWrite: 3.75 });
      expect(modelPrice(saved())).toBeNull();
    });

    it('sair de um campo sem mudar o valor não grava nada', async () => {
      setPrices({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
      show();
      await userEvent.click(field('entrada'));
      await userEvent.tab();
      expect(sentOf('settings.models.set')).toHaveLength(0);
    });

    it('Detectar modelos não apaga o preço que já estava no catálogo (RF-24, RF-30)', async () => {
      const price = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
      setPrices(price);
      show();
      await userEvent.click(screen.getByRole('button', { name: 'Detectar modelos' }));
      board.router.handle(lastSent('settings.models.detect'));
      syncStore(board.router);
      expect(mine().price).toEqual(price);
    });
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

describe('ModelsSettings: preços do Cursor', () => {
  const useCursor = () => {
    board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
    board.router.handle({ type: 'settings.models.detect', tool: 'cursor' });
    syncStore(board.router);
  };
  const back = () => board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude' } });

  it('a tarifa do Cursor só aparece no Cursor, explica a cobrança e grava a regra', async () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Somar a tarifa do Cursor (Cursor Token Rate)' })).toBeNull();
    useCursor();
    show();
    const toggle = screen.getAllByRole('switch', { name: 'Somar a tarifa do Cursor (Cursor Token Rate)' }).at(-1)!;
    expect(toggle).not.toBeChecked();
    expect(screen.getAllByText(/US\$ 0,25 por milhão de tokens/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Sobre a tarifa' }).at(-1)).toHaveAttribute(
      'href',
      'https://cursor.com/help/models-and-usage/token-rate',
    );
    await userEvent.click(toggle);
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { cursorTokenRate: true } });
    back();
  });

  it('o `auto` nasce com preço variável: sem os campos de preço, com o texto e o link da documentação', async () => {
    useCursor();
    show();
    const auto = screen.getByRole('switch', { name: 'Preço variável de auto' });
    expect(auto).toBeChecked();
    expect(screen.queryByLabelText('Preço de entrada de auto')).toBeNull();
    expect(screen.getAllByText(/O custo depende do modelo escolhido a cada pedido/)).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Preços do Cursor' })[0]).toHaveAttribute(
      'href',
      'https://cursor.com/docs/models-and-pricing',
    );
    // os outros modelos continuam com os campos
    expect(screen.getByRole('switch', { name: 'Preço variável de composer-2.5' })).not.toBeChecked();
    expect(screen.getByLabelText('Preço de entrada de composer-2.5')).toBeInTheDocument();
    back();
  });

  it('desligar o preço variável grava o flag e volta os campos; ligar num modelo comum os esconde', async () => {
    useCursor();
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Preço variável de auto' }));
    const sentAuto = lastSent('settings.models.set').catalog.find((m) => m.id === 'cursor:auto')!;
    expect(sentAuto.variablePrice).toBe(false);
    board.router.handle(lastSent('settings.models.set'));
    syncStore(board.router);
    expect(await screen.findByLabelText('Preço de entrada de auto')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Preço variável de composer-2.5' }));
    expect(lastSent('settings.models.set').catalog.find((m) => m.id === 'cursor:composer-2.5')!.variablePrice).toBe(true);
    board.router.handle(lastSent('settings.models.set'));
    syncStore(board.router);
    await waitFor(() => expect(screen.queryByLabelText('Preço de entrada de composer-2.5')).toBeNull());
    back();
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
