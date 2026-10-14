import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readProjectProfile } from '../src/extension/projectProfile';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-profile-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (rel: string, text = '') => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

describe('perfil do projeto', () => {
  it('lê linguagens, scripts, ferramentas, pastas e o título do README de um projeto TypeScript', () => {
    write(
      'package.json',
      JSON.stringify({
        scripts: { test: 'vitest run', lint: 'eslint .', weird: 1 },
        devDependencies: { typescript: '^5', vitest: '^2', prettier: '^3' },
      }),
    );
    write('tsconfig.json', '{}');
    write('eslint.config.mjs');
    write('README.md', 'texto antes\n\n# Meu App\n\nresto');
    write('src/index.ts');
    write('test/a.test.ts');
    write('.git/config');
    write('node_modules/x/index.js');
    write('dist/out.js');
    expect(readProjectProfile(dir)).toEqual({
      languages: ['TypeScript'],
      scripts: { test: 'vitest run', lint: 'eslint .' },
      tools: ['typescript', 'eslint', 'prettier', 'vitest'],
      folders: ['src', 'test'],
      readme: 'Meu App',
    });
  });

  it('reconhece Python por pyproject e as ferramentas dele', () => {
    write('pyproject.toml', '[tool.ruff]\nline-length = 100\n[tool.pytest.ini_options]\n');
    expect(readProjectProfile(dir)).toMatchObject({ languages: ['Python'], tools: ['pytest', 'ruff'] });
  });

  it('pasta vazia, inexistente ou package.json quebrado dão um perfil sem erro', () => {
    expect(readProjectProfile(dir)).toEqual({ languages: [], scripts: {}, tools: [], folders: [], readme: '' });
    expect(readProjectProfile(path.join(dir, 'nao-existe')).languages).toEqual([]);
    expect(readProjectProfile('').folders).toEqual([]);
    write('package.json', '{ quebrado');
    expect(readProjectProfile(dir).languages).toEqual(['JavaScript']);
  });
});
