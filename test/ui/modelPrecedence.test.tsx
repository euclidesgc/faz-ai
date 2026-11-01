// Card aberto: o aviso de precedência do modelo (card > agente > regra) na barra do agente e junto do campo Modelo.
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

describe('aviso de precedência do modelo no card', () => {
  it('o card preenchido pela regra vence o agente: a barra do agente avisa, com os dois valores', () => {
    renderThemed(<AgentBar card={cardWith('claude:opus@high', 'claude:haiku@medium')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O modelo do card (Claude Code · Haiku 5.5 - médio, preenchido pela regra Esforço da atividade baixo) vence o modelo do agente revisor (Claude Code · Opus 5.5 - alto).',
    );
  });

  it('sem Modelo no card, o agente vence a regra, e o aviso aparece também junto do campo Modelo', () => {
    const card = cardWith('claude:opus@high', null);
    renderThemed(
      <>
        <AgentBar card={card} />
        <FieldsSection card={card} />
      </>,
    );
    const text =
      'O modelo do agente revisor (Claude Code · Opus 5.5 - alto) vence a regra Esforço da atividade baixo (Claude Code · Haiku 5.5 - médio).';
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getAllByText(text)).toHaveLength(2);
    // a sugestão da regra continua oferecida ao lado
    expect(screen.getByText(/Sugerido pelas regras/)).toBeInTheDocument();
  });

  it('sem contradição (agente sem modelo, card preenchido pela regra) não há aviso', () => {
    const card = cardWith(null, 'claude:haiku@medium');
    renderThemed(
      <>
        <AgentBar card={card} />
        <FieldsSection card={card} />
      </>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/vence/)).toBeNull();
  });

  it('em inglês a frase e os nomes do board padrão são traduzidos', () => {
    setLocale('en');
    try {
      renderThemed(<AgentBar card={cardWith('claude:opus@high', null)} />);
      expect(screen.getByRole('alert')).toHaveTextContent(
        "The agent revisor's model (Claude Code · Opus 5.5 - high) beats the rule Task effort low (Claude Code · Haiku 5.5 - medium).",
      );
    } finally {
      setLocale('pt-BR');
    }
  });
});
