import { describe, expect, it } from 'vitest';
import { activeCounts, filterArtifacts, folderTree, inFolder } from '../src/shared/artifactLibrary';

const skill = (name: string, folder: string, usage: 'off' | 'contextual' = 'contextual') =>
  ({ kind: 'skill', name, description: `descrição de ${name}`, usage, folder }) as const;

describe('biblioteca de artefatos: helpers da lista', () => {
  it('conta as ativas sobre o total do tipo', () => {
    const list = [skill('a', ''), skill('b', '', 'off'), { kind: 'rule', usage: 'always' } as const];
    expect(activeCounts(list, 'skill')).toEqual({ active: 1, total: 2 });
    expect(activeCounts(list, 'agent')).toEqual({ active: 0, total: 0 });
  });

  it('inFolder inclui a pasta e as subpastas, e sem seleção vale tudo', () => {
    expect(inFolder('backend/node', 'backend')).toBe(true);
    expect(inFolder('backend', 'backend')).toBe(true);
    expect(inFolder('backend-x', 'backend')).toBe(false);
    expect(inFolder(undefined, 'backend')).toBe(false);
    expect(inFolder(undefined, null)).toBe(true);
  });

  it('filtra por status, busca (inclusive pela pasta) e pasta', () => {
    const list = [skill('api', 'backend/node'), skill('tela', 'frontend', 'off'), skill('raiz', '')];
    const names = (x: typeof list) => x.map((s) => s.name);
    expect(names(filterArtifacts(list, { query: '', status: 'active' }))).toEqual(['api', 'raiz']);
    expect(names(filterArtifacts(list, { query: '', status: 'inactive' }))).toEqual(['tela']);
    expect(names(filterArtifacts(list, { query: 'backend', status: 'all' }))).toEqual(['api']);
    expect(names(filterArtifacts(list, { query: '', status: 'all', folder: 'frontend' }))).toEqual(['tela']);
  });

  it('monta a árvore com os níveis de cima, as pastas vazias e a contagem das subpastas', () => {
    const tree = folderTree(['backend/node', 'frontend/react'], [skill('a', 'backend/node'), skill('b', 'backend'), skill('c', 'extra')]);
    expect(tree.map((n) => [n.path, n.count])).toEqual([
      ['backend', 2],
      ['extra', 1],
      ['frontend', 0],
    ]);
    expect(tree[0]!.children.map((n) => [n.path, n.name, n.count])).toEqual([['backend/node', 'node', 1]]);
    expect(tree[2]!.children[0]!.path).toBe('frontend/react');
  });
});
