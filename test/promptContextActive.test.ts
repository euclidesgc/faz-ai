import { describe, expect, it } from 'vitest';
import { contextLines, alwaysRefs } from '../src/extension/promptContext';
import { artifactLocation, itemOfArtifact, type BoardArtifact } from '../src/shared/artifacts';
import type { HarnessSelection, HarnessUsage } from '../src/shared/harnessSelection';
import type { BoardState } from '../src/shared/model';
import { boardState, card } from './fakes/board';

// O contexto do pedido depois da decisão "ativo/inativo" (docs/decisoes/biblioteca-de-artefatos-do-board.md): a
// regra ativa vai em todo pedido; a skill ativa só entra no card que a lista no campo Skills.

const artifact = (kind: 'rule' | 'skill', name: string, usage: HarnessUsage): BoardArtifact => ({
  id: `${kind}-${name}`,
  kind,
  name,
  description: `Descrição de ${name}`,
  usage,
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  createdAt: 0,
  updatedAt: 0,
  revision: 1,
  path: kind === 'skill' ? `/lib/skills/${name}/SKILL.md` : `/lib/rules/${name}.md`,
});

function state(artifacts: BoardArtifact[], skillsOfCard: string[] = []): BoardState {
  const selection: HarnessSelection[] = artifacts.map((a) => ({
    kind: itemOfArtifact(a).kind as HarnessSelection['kind'],
    location: artifactLocation(a),
    usage: a.usage,
  }));
  return boardState({
    harness: { rules: [], skills: [], agents: [], inventory: [], library: { directory: '/lib', artifacts } },
    harnessSelection: selection,
    fieldDefs: [
      {
        id: 'f-skills',
        boardId: 'b',
        name: 'Skills',
        kind: 'multiselect',
        options: [],
        appliesToTypes: null,
        display: 'chip',
        position: 0,
      },
    ],
    cards: [card('c')],
    fieldValues: skillsOfCard.length ? [{ cardId: 'c', fieldId: 'f-skills', value: skillsOfCard }] : [],
  });
}

describe('contexto do pedido com artefatos ativos', () => {
  it('as regras ativas entram em contextLines().always; a inativa não', () => {
    const s = state([artifact('rule', 'estilo', 'always'), artifact('rule', 'testes', 'always'), artifact('rule', 'rascunho', 'off')]);
    const { always } = contextLines(s);
    expect(alwaysRefs(s).map((r) => [r.kind, r.name])).toEqual([
      ['rule', 'estilo'],
      ['rule', 'testes'],
    ]);
    expect(always).toHaveLength(2);
    expect(always[1]).toContain('Contexto fixo deste board');
    expect(always[1]).toContain('/lib/rules/estilo.md');
    expect(always[1]).toContain('/lib/rules/testes.md');
    expect(always[1]).not.toContain('rascunho');
  });

  it('a skill ativa não entra no contexto fixo nem sem card', () => {
    const s = state([artifact('skill', 'revisar', 'contextual')]);
    expect(alwaysRefs(s)).toEqual([]);
    const lines = contextLines(s);
    expect(lines.always).toHaveLength(1);
    expect(lines.card).toEqual([]);
    // mesmo com um card que não a lista
    expect(contextLines(s, card('c')).card).toEqual([]);
  });

  it('a skill ativa entra no card que a lista no campo Skills, e só nele', () => {
    const s = state([artifact('skill', 'revisar', 'contextual'), artifact('skill', 'outra', 'contextual')], ['revisar']);
    const lines = contextLines(s, card('c'));
    expect(lines.always).toHaveLength(1);
    expect(lines.card).toHaveLength(1);
    expect(lines.card[0]).toContain('skill revisar');
    expect(lines.card[0]).toContain('/lib/skills/revisar/SKILL.md');
    expect(lines.card[0]).not.toContain('outra');
  });

  it('a skill inativa listada no card some do contexto, sem quebrar o card', () => {
    const s = state([artifact('skill', 'revisar', 'off')], ['revisar']);
    expect(contextLines(s, card('c')).card).toEqual([]);
  });
});
