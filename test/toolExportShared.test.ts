import { describe, expect, it } from 'vitest';
import { defaultSelection, itemOutcome, type ExportFile, type ExportItem } from '../src/shared/toolExport';

const item = (over: Partial<ExportItem> & { id: string }, files: Partial<ExportFile>[] = [{}]): ExportItem => ({
  kind: 'skill',
  name: over.id,
  description: '',
  usage: 'contextual',
  flowSkill: false,
  losses: [],
  extras: [],
  files: files.map((f, i) => ({ path: `/x/${i}`, exists: false, ...f })),
  ...over,
});

describe('defaultSelection', () => {
  it('marca Sempre e Pelo card; deixa fluxo, desligado e bloqueado', () => {
    const sel = defaultSelection([
      item({ id: 'a', usage: 'always' }),
      item({ id: 'b' }),
      item({ id: 'fluxo', flowSkill: true }),
      item({ id: 'off', usage: 'off' }),
      item({ id: 'bloq', blocked: 'missing' }),
    ]);
    expect([...sel].sort()).toEqual(['a', 'b']);
  });
});

describe('itemOutcome', () => {
  it('write quando nada existe', () => expect(itemOutcome(item({ id: 'a' }), false)).toBe('write'));
  it('skip e replace quando existe', () => {
    const i = item({ id: 'a' }, [{ exists: true }]);
    expect(itemOutcome(i, false)).toBe('skip');
    expect(itemOutcome(i, true)).toBe('replace');
  });
  it('um existente e um novo: o item inteiro é pulado', () => {
    expect(itemOutcome(item({ id: 'a' }, [{ exists: true }, {}]), false)).toBe('skip');
  });
  it('refused por bloqueio ou arquivo recusado', () => {
    expect(itemOutcome(item({ id: 'a', blocked: 'unsupported' }), true)).toBe('refused');
    expect(itemOutcome(item({ id: 'a' }, [{ refused: 'symlink', exists: true }]), true)).toBe('refused');
  });
});
