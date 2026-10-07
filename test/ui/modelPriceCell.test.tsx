import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { ModelPriceCell } from '../../src/webview/components/settings/ModelPriceCell';
import type { ModelOption } from '../../src/shared/models';
import { PRICE_URLS, builtinPrice, restoreBuiltinPrice } from '../../src/shared/prices';

const opt = (id: string, extra: Partial<ModelOption> = {}): ModelOption => {
  const [tool, model] = id.split(':') as [ModelOption['tool'], string];
  return { id, tool, model, label: model, efforts: [], defaultEffort: null, ...extra };
};
const TABLE = builtinPrice('claude:opus')!;
const quatro = { input: TABLE.input, output: TABLE.output, cacheRead: TABLE.cacheRead, cacheWrite: TABLE.cacheWrite };
const dayAfter = (checkedAt: string, days: number) => {
  const [y, m, d] = checkedAt.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days, 12));
};

const show = (model: ModelOption, today = new Date(), handlers: Partial<Parameters<typeof ModelPriceCell>[0]> = {}) => {
  const onRestore = vi.fn();
  const onPrice = vi.fn();
  const onVariable = vi.fn();
  render(
    <Theme>
      <ModelPriceCell
        model={model}
        tool={model.tool}
        today={today}
        onPrice={onPrice}
        onVariable={onVariable}
        onRestore={onRestore}
        {...handlers}
      />
    </Theme>,
  );
  return { onRestore, onPrice, onVariable };
};

describe('ModelPriceCell', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('preço embutido: marca "embutido · conferido em …" com o link da fonte, sem botão de voltar', () => {
    show(restoreBuiltinPrice(opt('claude:opus')));
    expect(screen.getByText(/embutido/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`conferido em ${TABLE.checkedAt}`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'fonte' })).toHaveAttribute('href', TABLE.url);
    expect(screen.queryByRole('button', { name: /Voltar ao preço embutido/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('preço manual com embutido disponível: marca "manual" e o botão Voltar chama onRestore', async () => {
    const { onRestore } = show(opt('claude:opus', { price: quatro, priceSource: 'manual' }));
    expect(screen.getByText('manual')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao preço embutido de opus' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('preço manual sem embutido: marca "manual" e sem botão', () => {
    show(opt('claude:sem-tabela', { price: quatro }));
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar ao preço embutido/ })).toBeNull();
  });

  it('aviso de preço velho: 61 dias depois da conferência, com link "conferir agora"; 60 dias e manual não avisam', () => {
    const embutido = restoreBuiltinPrice(opt('claude:opus'));
    const { unmount } = render(
      <Theme>
        <ModelPriceCell
          model={embutido}
          tool="claude"
          today={dayAfter(TABLE.checkedAt, 61)}
          onPrice={() => {}}
          onVariable={() => {}}
          onRestore={() => {}}
        />
      </Theme>,
    );
    const warn = screen.getByRole('status');
    expect(warn).toHaveTextContent(`Preços conferidos em ${TABLE.checkedAt}`);
    expect(screen.getByRole('link', { name: 'conferir agora' })).toHaveAttribute('href', TABLE.url);
    unmount();

    show(embutido, dayAfter(TABLE.checkedAt, 60));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('origem manual nunca avisa preço velho, mesmo com data antiga', () => {
    show(opt('claude:opus', { price: quatro, priceSource: 'manual', priceCheckedAt: '2000-01-01' }), new Date());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('modelo com três campos: aviso de sem custo e "Preencher" foca o campo vazio', async () => {
    show(opt('claude:opus', { price: { input: 1, output: 2, cacheWrite: 4 }, priceSource: 'manual' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'As execuções deste modelo vão ficar sem custo até os quatro preços serem preenchidos.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preencher' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Preço de leitura de cache de opus'));
  });

  it('modelo sem nenhum preço e sem tabela: aviso de sem custo; preço variável: sem aviso e sem campos', () => {
    show(opt('cursor:outro'));
    expect(screen.getByRole('status')).toHaveTextContent('sem custo');
  });

  it('preço variável: sem campos, sem marca e sem aviso; Copilot explica o pedido premium com o link', () => {
    show(opt('copilot:gpt-5-mini', { variablePrice: true }));
    expect(screen.queryByLabelText('Preço de entrada de gpt-5-mini')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/pedido premium/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Preços do Copilot' })).toHaveAttribute('href', PRICE_URLS.copilot);
  });

  it('preço variável no Cursor mantém o texto atual e o link "Preços do Cursor"', () => {
    show(opt('cursor:auto', { variablePrice: true }));
    expect(screen.getByRole('link', { name: 'Preços do Cursor' })).toHaveAttribute('href', PRICE_URLS.cursor);
  });

  it('editar um campo chama onPrice ao sair; número inválido volta ao gravado', async () => {
    const { onPrice } = show(opt('claude:opus', { price: quatro, priceSource: 'manual' }));
    const input = screen.getByLabelText('Preço de entrada de opus') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '7');
    await userEvent.tab();
    expect(onPrice).toHaveBeenCalledWith('input', 7);
    expect(input).toHaveAttribute('id', 'price-claude:opus-input');
  });
});
