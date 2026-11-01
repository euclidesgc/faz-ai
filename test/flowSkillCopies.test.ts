import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findFlowSkillCopies } from '../src/extension/flowSkillCopies';

const tmps: string[] = [];
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-copy-'));
  tmps.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const put = (base: string, rel: string, text = 'x'): string => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

/** As seis skills do fluxo (`FLOW_SKILL_NAMES`): a que sai em `flowSkill.ts`, mais as de assunto. */
const SIX_SKILLS = [
  'faz-ai-fluxo',
  'faz-ai-harness-do-card',
  'faz-ai-workspace-e-pr',
  'faz-ai-implementacao-rodadas',
  'faz-ai-revisao-e-homologacao',
  'faz-ai-modo-autonomo',
];
const SEED = '---\nname: "condutor-do-board"\ndescription: "Conduz"\nfaz-ai-seed: true\n---\n\nConduza.\n';

describe('cópias antigas da skill do fluxo e dos agentes de fábrica', () => {
  it('sem cópia, lista vazia', () => {
    expect(findFlowSkillCopies({ projectDir: tmp(), homeDir: tmp() })).toEqual([]);
  });
  it('pasta do projeto ou do usuário que não existe devolve lista vazia', () => {
    expect(findFlowSkillCopies({ projectDir: path.join(tmp(), 'nao-existe'), homeDir: path.join(tmp(), 'nao-existe') })).toEqual([]);
  });
  it('acha no projeto e no usuário, em qualquer ferramenta, e não altera o arquivo', () => {
    const project = tmp();
    const home = tmp();
    const a = put(project, '.claude/skills/faz-ai-fluxo/SKILL.md', 'antiga');
    const b = put(home, '.cursor/skills/faz-ai-fluxo/SKILL.md');
    const c = put(home, '.kimi-code/skills/faz-ai-fluxo/SKILL.md');
    put(home, '.claude/skills/outra/SKILL.md');
    expect(findFlowSkillCopies({ projectDir: project, homeDir: home })).toEqual([a, b, c]);
    expect(fs.readFileSync(a, 'utf8')).toBe('antiga');
  });
  it('acha as seis skills do fluxo, não só a de sempre', () => {
    const project = tmp();
    const files = SIX_SKILLS.map((name) => put(project, `.claude/skills/${name}/SKILL.md`));
    expect(findFlowSkillCopies({ projectDir: project, homeDir: tmp() })).toEqual(files);
  });
  it('acha agente com faz-ai-seed: true no cabeçalho e ignora o da pessoa, sem a marca', () => {
    const home = tmp();
    const seed = put(home, '.claude/agents/condutor-do-board.md', SEED);
    put(home, '.claude/agents/meu-agente.md', '---\nname: "meu"\ndescription: "Meu"\n---\n\nFaço.\n');
    put(home, '.claude/agents/leia-depois.txt', SEED);
    expect(findFlowSkillCopies({ projectDir: tmp(), homeDir: home })).toEqual([seed]);
  });
  it('a marca fora do cabeçalho (no corpo do agente) não conta', () => {
    const home = tmp();
    put(home, '.cursor/agents/corpo.md', '---\nname: "corpo"\n---\n\nfaz-ai-seed: true\n');
    expect(findFlowSkillCopies({ projectDir: tmp(), homeDir: home })).toEqual([]);
  });
  it('projeto e usuário iguais não repetem o arquivo', () => {
    const same = tmp();
    const file = put(same, '.kimi-code/skills/faz-ai-fluxo/SKILL.md');
    expect(findFlowSkillCopies({ projectDir: same, homeDir: same })).toEqual([file]);
  });
});
