import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchSource, findSkills, parseSource } from '../src/extension/skillInstall';
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

describe('instalar skills de uma pasta ou repositório', () => {
  it('só aceita pasta existente, dono/repositorio ou endereço git por https ou ssh', () => {
    expect(parseSource(root)).toEqual({ kind: 'dir', dir: root });
    expect(parseSource('anthropics/skills')).toEqual({ kind: 'git', url: 'https://github.com/anthropics/skills.git' });
    expect(parseSource(' https://gitlab.com/time/skills.git ')).toEqual({ kind: 'git', url: 'https://gitlab.com/time/skills.git' });
    expect(parseSource('git@github.com:time/skills.git')).toEqual({ kind: 'git', url: 'git@github.com:time/skills.git' });
    for (const bad of [
      '',
      '--upload-pack=x',
      'ext::sh -c x',
      'file:///etc',
      'http://inseguro.dev/x.git',
      path.join(root, 'nao-existe'),
      'https://x.dev/a b',
    ])
      expect(() => parseSource(bad)).toThrow();
  });

  it('encontra as skills, e conta os arquivos de apoio, sem entrar em pastas ocultas nem em node_modules', () => {
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

  it('clona um repositório git numa pasta temporária e a apaga depois', async () => {
    const repo = path.join(root, 'repo');
    write(repo, 'commit/SKILL.md', skill('Commit'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
    // um repositório local por caminho é lido direto; o clone é exercitado pelo mesmo comando, com o caminho como endereço
    const fetched = await fetchSource({ kind: 'git', url: repo });
    expect(findSkills(fetched.dir).map((k) => k.name)).toEqual(['commit']);
    expect(fetched.dir.startsWith(repo)).toBe(false);
    fetched.cleanup();
    expect(fs.existsSync(fetched.dir)).toBe(false);
    await expect(fetchSource({ kind: 'git', url: path.join(root, 'nao-e-repo') })).rejects.toThrow('Não foi possível clonar');
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
