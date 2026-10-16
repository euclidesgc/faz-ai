import { describe, expect, it } from 'vitest';
import { bashCommandTerms } from '../src/shared/bashCommand';

describe('bashCommandTerms', () => {
  it.each([
    ['npm test -- foo.ts', ['npm test']],
    ['npx vitest run', ['npx vitest']],
    ['git status', ['git status']],
    ['cat src/x.ts', ['cat']],
    ['cd x && npm test', ['npm test']],
    ['FOO=1 git log', ['git log']],
    ['ls | wc -l', ['ls', 'wc']],
    ['npm --version', ['npm']],
    ['npm run build:ext', ['npm run']],
    ['node scripts/x.js', ['node']],
    ['node segredo.js', ['node']],
    ['npx foo.ts', ['npx']],
    ['make deploy-prod', ['make deploy-prod']],
    ['cd x', []],
    ['/usr/bin/grep -r a .', ['grep']],
    ['$(echo hi)', ['outro']],
    ['"quoted" a', ['outro']],
    ['', []],
  ])('%s', (cmd, expected) => {
    expect(bashCommandTerms(cmd)).toEqual(expected);
  });

  it('nunca devolve argumentos', () => {
    expect(bashCommandTerms('cat /home/pessoa/segredo.txt').join(' ')).not.toContain('segredo');
  });
});
