// Card aberto: a linha "Modelo indicado pelo board" na barra do agente e junto do campo Modelo (com o link Usar),
// só quando o Modelo do card difere da indicação (agente > regra > padrão).
import { renderThemed, seedBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { ExecProfile } from '../../src/shared/execution';
import type { Card } from '../../src/shared/model';
import { modelFieldOf } from '../../src/shared/models';
import { AgentBar } from '../../src/webview/components/card/AgentBar';
import { FieldsSection } from '../../src/webview/components/card/FieldsSection';
import { setLocale } from '../../src/webview/i18n';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeEach(async () => {
  await seedBoard();
});

/** A sub-tarefa com o agente `revisor` (modelo fixo) e, se houver, o Modelo do card; a regra do esforço Baixo vem do board. */
function cardWith(agentModel: string | null, cardModel: string | null): Card {
  const s = useBoardStore.getState().state!;
  const sub = s.cards.find((c) => c.parentId !== null)!;
  const field = modelFieldOf(s, sub)!;
  const effort = s.fieldDefs.find((f) => f.name === 'Esforço da atividade')!;
  const profile = {
    id: 'revisor',
    name: 'revisor',
    isDefault: true,
    model: agentModel,
    skills: [],
    mcpServers: [],
  } as unknown as ExecProfile;
  useBoardStore.setState({
    state: {
      ...s,
      cards: s.cards.map((c) => (c.id === sub.id ? { ...c, execProfile: 'revisor' } : c)),
      fieldValues: [
        ...s.fieldValues.filter((v) => v.cardId !== sub.id),
        { cardId: sub.id, fieldId: effort.id, value: 'Baixo' },
        ...(cardModel ? [{ cardId: sub.id, fieldId: field.id, value: cardModel }] : []),
      ],
      board: { ...s.board, execProfiles: [profile] },
    },
  });
  return useBoardStore.getState().state!.cards.find((c) => c.id === sub.id)!;
}

describe('linha "Modelo indicado pelo board" no card', () => {
  const opus = 'Modelo indicado pelo board: Claude Code · Opus 5.5 - alto';

  it('o card preenchido pela regra difere do agente: a barra e o campo mostram a indicação, com Usar, sem alerta', () => {
    const card = cardWith('claude:opus@high', 'claude:haiku@medium');
    renderThemed(
      <>
        <AgentBar card={card} />
        <FieldsSection card={card} />
      </>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText(opus, { exact: false })).toHaveLength(2);
    expect(screen.getByText('Usar')).toBeInTheDocument();
    expect(screen.queryByText(/Sugerido pelas regras/)).toBeNull();
    expect(screen.queryByText(/vence/)).toBeNull();
  });

  it('sem Modelo no card, nada é indicado e a sugestão das regras continua no campo', () => {
    const card = cardWith('claude:opus@high', null);
    renderThemed(
      <>
        <AgentBar card={card} />
        <FieldsSection card={card} />
      </>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Modelo indicado/)).toBeNull();
    expect(screen.getByText(/Sugerido pelas regras/)).toBeInTheDocument();
  });

  it('agente sem modelo e card preenchido pela regra: nada', () => {
    const card = cardWith(null, 'claude:haiku@medium');
    renderThemed(
      <>
        <AgentBar card={card} />
        <FieldsSection card={card} />
      </>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Modelo indicado/)).toBeNull();
  });

  it('em inglês a linha Modelo indicado pelo board é traduzida', () => {
    setLocale('en');
    try {
      renderThemed(<AgentBar card={cardWith('claude:opus@high', 'claude:haiku@medium')} />);
      expect(screen.getByText('Model suggested by the board: Claude Code · Opus 5.5 - high')).toBeInTheDocument();
    } finally {
      setLocale('pt-BR');
    }
  });
  it('a sugestão vem do modelo da fase da coluna: "Sugerido pela coluna X" junto do campo, em português e inglês', () => {
    const card = cardWith(null, null);
    const s = useBoardStore.getState().state!;
    const column = s.columns.find((c) => c.id === card.columnId)!;
    useBoardStore.setState({
      state: { ...s, columns: s.columns.map((c) => (c.id === column.id ? { ...c, phaseModel: 'claude:opus@high' } : c)) },
    });
    const { unmount } = renderThemed(<FieldsSection card={card} />);
    expect(screen.getByText(`Sugerido pela coluna ${column.name}: Claude Code · Opus 5.5 - alto`)).toBeInTheDocument();
    expect(screen.queryByText(/Sugerido pelas regras/)).toBeNull();
    unmount();
    setLocale('en');
    try {
      renderThemed(<FieldsSection card={card} />);
      expect(screen.getByText(`Suggested by column ${column.name}: Claude Code · Opus 5.5 - high`)).toBeInTheDocument();
    } finally {
      setLocale('pt-BR');
    }
  });
});
