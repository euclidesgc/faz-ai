import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchSource, findSkills, installSkills, parseSource } from '../src/extension/skillInstall';
import { FLOW_SKILL } from '../src/extension/flowSkill';

it('a skill do fluxo, no modo autônomo, manda registrar o pull request e parar na última coluna da IA, sem mover para a conclusão', () => {
  const autonomo = FLOW_SKILL.body.slice(FLOW_SKILL.body.indexOf('## Modo autônomo'));
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

  it('encontra as skills, e copia só as escolhidas, sem links simbólicos e sem substituir', () => {
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
    const dest = path.join(root, 'projeto/.claude/skills');
    expect(installSkills(src, ['skills/revisar'], dest)).toEqual([path.join(dest, 'revisar/SKILL.md')]);
    expect(fs.readFileSync(path.join(dest, 'revisar/references/modelo.md'), 'utf8')).toBe('Modelo');
    expect(fs.existsSync(path.join(dest, 'revisar/link'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'deploy'))).toBe(false);
    expect(() => installSkills(src, ['skills/revisar'], dest)).toThrow('Já existe');
    expect(() => installSkills(src, ['skills/Nome Ruim'], dest)).toThrow('nome de skill válido');
    expect(() => installSkills(src, ['../fora'], dest)).toThrow('não encontrada');
    // se uma das escolhidas não puder ser instalada, nenhuma é copiada
    expect(() => installSkills(src, ['outra/deploy', 'skills/revisar'], dest)).toThrow('Já existe');
    expect(fs.existsSync(path.join(dest, 'deploy'))).toBe(false);
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
