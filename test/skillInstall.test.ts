import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSkills } from '../src/extension/skillInstall';
import { parseFrontmatter, skillTemplate } from '../src/extension/frontmatter';
import { FLOW_SKILL } from '../src/extension/flowSkill';
import { FLOW_TEXT } from './flowSkillText';

it('a skill do fluxo, no modo autônomo, manda registrar o pull request e parar na última coluna da IA, sem mover para a conclusão', () => {
  const autonomo = FLOW_TEXT.slice(FLOW_TEXT.indexOf('## Modo autônomo'));
  expect(autonomo).not.toContain('coluna de conclusão');
  expect(autonomo).toContain('set_pull_request');
  expect(autonomo).toMatch(/pare/);
});

let root: string;
const write = (base: string, rel: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), content);
};
const skill = (description: string) => `---\nname: x\ndescription: ${description}\n---\n`;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-install-')));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('encontrar skills numa pasta de origem', () => {
  it('encontra as skills, sem entrar em pastas ocultas, de dependências nem em links simbólicos', () => {
    const src = path.join(root, 'origem');
    write(src, 'skills/revisar/SKILL.md', skill('Revisa'));
    write(src, 'skills/revisar/references/modelo.md', 'Modelo');
    write(src, 'skills/Nome Ruim/SKILL.md', skill('x'));
    write(src, 'outra/deploy/SKILL.md', skill('Deploy'));
    write(src, 'node_modules/pacote/SKILL.md', skill('ignorada'));
    write(src, '.git/SKILL.md', skill('ignorada'));
    fs.symlinkSync('/etc/hosts', path.join(src, 'skills/revisar/link'));
    expect(findSkills(src)).toEqual([
      { rel: 'outra/deploy', name: 'deploy', description: 'Deploy', files: 0, valid: true },
      { rel: 'skills/Nome Ruim', name: 'Nome Ruim', description: 'x', files: 0, valid: false },
      { rel: 'skills/revisar', name: 'revisar', description: 'Revisa', files: 1, valid: true },
    ]);
  });
});

describe('skillTemplate: descrição como YAML válido', () => {
  const descricaoLinha = (md: string) => md.split('\n').find((l) => l.startsWith('description:'))!;

  it('grava a descrição como string JSON e o leitor devolve a original', () => {
    const original = 'Use sempre: quando houver "aspas" e barra \\';
    const md = skillTemplate('x', original, 'corpo');
    const valor = descricaoLinha(md).slice('description:'.length).trim();
    expect(valor.startsWith('"') && valor.endsWith('"')).toBe(true);
    expect(parseFrontmatter(md).description).toBe(original);
  });

  it('a skill do fluxo, que tem ": " na descrição, sai entre aspas e volta igual', () => {
    const md = skillTemplate(FLOW_SKILL.name, FLOW_SKILL.description, FLOW_TEXT);
    const valor = descricaoLinha(md).slice('description:'.length).trim();
    expect(valor.startsWith('"') && valor.endsWith('"')).toBe(true);
    expect(parseFrontmatter(md).description).toBe(FLOW_SKILL.description.replace(/\r?\n/g, ' ').trim());
  });
});
