import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { expandCommand, gateApplies, shellQuote, tailOf } from '../src/shared/gate';
import type { BoardState, Card } from '../src/shared/model';
import type { CardStatus } from '../src/shared/status';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const CHECK = { name: 'typecheck', command: 'npm run typecheck', timeoutSec: 60 };

let base: BoardState;

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-gate'),
  });
  base = router.snapshot();
});

/** Estado com checagens nas colunas indicadas (por nome) do workflow das histórias, e um card na coluna `from`. */
function world(withChecks: string[], from: string, status: CardStatus | null = 'running') {
  const wf = base.workflows.find((w) => w.kind === 'parent')!;
  const columns = base.columns.map((c) => (c.workflowId === wf.id && withChecks.includes(c.name) ? { ...c, checks: [CHECK] } : c));
  const col = (name: string) => columns.find((c) => c.workflowId === wf.id && c.name === name)!;
  const card = { columnId: col(from).id, workflowId: wf.id, status } as Card;
  return { state: { ...base, columns } as BoardState, card, col, wf };
}

describe('gateApplies', () => {
  it('vale para a IA saindo para a frente de coluna com checagens', () => {
    const { state, card, col } = world(['Revisão'], 'Revisão');
    expect(gateApplies(state, card, 'move', col('Concluído').id, true)).toBe(true);
  });

  it('não vale para a pessoa: arrastar à mão não passa pelo portão', () => {
    const { state, card, col } = world(['Revisão'], 'Revisão');
    expect(gateApplies(state, card, 'move', col('Concluído').id, false)).toBe(false);
    expect(gateApplies(state, card, 'review', null, false)).toBe(false);
  });

  it('não vale para trás, para a mesma coluna nem para o cancelamento', () => {
    const { state, card, col } = world(['Revisão'], 'Revisão');
    const cancelled = state.columns.find((c) => c.category === 'cancelled' && c.workflowId === card.workflowId)!;
    expect(gateApplies(state, card, 'move', col('Plan').id, true)).toBe(false);
    expect(gateApplies(state, card, 'move', col('Revisão').id, true)).toBe(false);
    expect(gateApplies(state, card, 'move', cancelled.id, true)).toBe(false);
    expect(gateApplies(state, card, 'move', null, true)).toBe(false);
    expect(gateApplies(state, card, 'move', 'inexistente', true)).toBe(false);
  });

  it('não vale em coluna sem checagens, nem para a revisão nela', () => {
    const { state, card, col } = world(['Plan'], 'Revisão');
    expect(gateApplies(state, card, 'move', col('Concluído').id, true)).toBe(false);
    expect(gateApplies(state, card, 'review', null, true)).toBe(false);
  });

  it('o pedido de revisão vale na coluna com checagens, sem destino', () => {
    const { state, card } = world(['Revisão'], 'Revisão', 'ready');
    expect(gateApplies(state, card, 'review', null, true)).toBe(true);
  });

  it('verifying não reentra o portão', () => {
    const { state, card, col } = world(['Revisão'], 'Revisão', 'verifying');
    expect(gateApplies(state, card, 'move', col('Concluído').id, true)).toBe(false);
    expect(gateApplies(state, card, 'review', null, true)).toBe(false);
  });
});

describe('shellQuote', () => {
  it('protege espaço, aspas simples, cifrão e quebra de linha', () => {
    expect(shellQuote('a b')).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('$HOME `x`')).toBe("'$HOME `x`'");
    expect(shellQuote('a\nb')).toBe("'a\nb'");
    expect(shellQuote('')).toBe("''");
  });
});

describe('expandCommand', () => {
  it('troca {base} e {changed_files}, cada nome entre aspas', () => {
    expect(expandCommand('git diff {base}...HEAD -- {changed_files}', { base: 'develop', changedFiles: ['a.ts', 'dir/b c.ts'] })).toBe(
      "git diff 'develop'...HEAD -- 'a.ts' 'dir/b c.ts'",
    );
  });

  it('lista vazia vira texto vazio e os marcadores repetidos são todos trocados', () => {
    expect(expandCommand('lint {changed_files} && echo {base} {base}', { base: 'main', changedFiles: [] })).toBe(
      "lint  && echo 'main' 'main'",
    );
  });

  it('um nome com $& ou cifrão não vira padrão de troca', () => {
    expect(expandCommand('x {changed_files}', { base: 'b', changedFiles: ['$&.ts'] })).toBe("x '$&.ts'");
  });

  it('um arquivo com marcador no nome não tira a base das aspas', () => {
    expect(expandCommand('lint {changed_files}', { base: '$(touch${IFS}x)', changedFiles: ['a{base}b.ts'] })).toBe("lint 'a{base}b.ts'");
  });
});

describe('tailOf', () => {
  it('mantém as últimas linhas', () => {
    const out = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
    const tail = tailOf(out, 3);
    expect(tail).toBe('l97\nl98\nl99');
  });

  it('limita também em caracteres, ficando com o fim, e ignora a quebra final', () => {
    expect(tailOf('x'.repeat(50) + 'FIM\n\n', 40, 10)).toBe('xxxxxxxFIM');
    expect(tailOf('')).toBe('');
  });
});
