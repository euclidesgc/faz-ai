import { describe, expect, it } from 'vitest';
import { missingSelections, selectedItems, toolItemsOf } from '../src/shared/harnessSelection';
import type { BoardArtifact } from '../src/shared/artifacts';
import type { HarnessItem } from '../src/shared/harness';
import type { BoardState } from '../src/shared/model';

// A marcação do board vem só das cópias guardadas no banco: um item que ficou só na pasta da ferramenta
// não entra em execução (não há cópia para congelar no snapshot da execução).

const toolSkill: HarnessItem = {
  kind: 'skill',
  scope: 'project',
  name: 'da-ferramenta',
  description: 'Só na pasta da ferramenta',
  path: '/projeto/.claude/skills/da-ferramenta/SKILL.md',
  location: '.claude/skills/da-ferramenta/SKILL.md',
  layout: 'skills',
};

const artifact = (over: Partial<BoardArtifact>): BoardArtifact => ({
  id: 'a1',
  kind: 'skill',
  name: 'copiada',
  description: 'Cópia do board',
  usage: 'contextual',
  origin: '.claude/skills/copiada/SKILL.md',
  originTool: 'claude',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  path: '/dados/biblioteca/skills/copiada/SKILL.md',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

type State = Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>;

const state = (artifacts: BoardArtifact[] | undefined, selection: State['harnessSelection']): State =>
  ({
    board: { aiTool: 'claude' },
    harness: {
      inventory: [{ tool: 'claude', installed: true, items: [toolSkill] }],
      ...(artifacts ? { library: { directory: '/dados/biblioteca', artifacts } } : {}),
    },
    harnessSelection: selection,
  }) as unknown as State;

describe('fonte da marcação do board', () => {
  it('com a biblioteca carregada, só as cópias do board valem; a marcação sem cópia aparece como ausente', () => {
    const copied = artifact({});
    const s = state(
      [copied],
      [
        { kind: 'skill', location: copied.origin, usage: 'contextual' },
        { kind: 'skill', location: toolSkill.location, usage: 'contextual' },
      ],
    );
    expect(toolItemsOf(s).map((i) => i.name)).toEqual(['copiada']);
    expect(selectedItems(s, 'skill').map((i) => i.path)).toEqual([copied.path]);
    expect(missingSelections(s)).toEqual([{ kind: 'skill', location: toolSkill.location, usage: 'contextual' }]);
  });

  it('uma cópia cuja origem estava ausente fica no board, não entra em execução e aparece como ausente', () => {
    const gone = artifact({ id: 'a2', name: 'sumiu', origin: '.claude/skills/sumiu/SKILL.md', missing: true, path: '' });
    const s = state([gone], [{ kind: 'skill', location: gone.origin, usage: 'always' }]);
    expect(selectedItems(s, 'skill')).toEqual([]);
    expect(missingSelections(s).map((x) => x.location)).toEqual([gone.origin]);
  });

  it('antes de a biblioteca ser carregada, vale o catálogo da ferramenta', () => {
    const s = state(undefined, [{ kind: 'skill', location: toolSkill.location, usage: 'contextual' }]);
    expect(selectedItems(s, 'skill').map((i) => i.name)).toEqual(['da-ferramenta']);
    expect(missingSelections(s)).toEqual([]);
  });
});
