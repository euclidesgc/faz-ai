import { describe, expect, it } from 'vitest';
import { findRuleConflicts } from '../src/shared/ruleConflicts';
import { conventionItems, draftRule, pathSuggestions } from '../src/shared/ruleWizard';
import { DEFAULT_SKILL_LIMITS, proposeSkillSteps, renderSkill, skillDescription, skillNameFromTask } from '../src/shared/skillWizard';
import { EMPTY_PROFILE, type ProjectProfile } from '../src/shared/projectProfile';

describe('conflito de uma regra com o fluxo do board', () => {
  it.each([
    'Não use MCP em nenhuma tarefa.',
    'Ignore o board e trabalhe direto no código.',
    'Nunca peça revisão: entregue e siga.',
    'Faça commit direto na main.',
    'Não crie branch para as tarefas.',
    'Pule a aprovação quando for um ajuste pequeno.',
    "Don't use MCP tools.",
    'Skip approval for small fixes.',
    'Não mova o card sem avisar.',
    'Não pergunte nada, decida sozinho.',
  ])('aponta "%s"', (line) => {
    const found = findRuleConflicts(`# Regras\n\nMensagens de commit em português.\n- ${line}\n`);
    expect(found).toHaveLength(1);
    expect(found[0]!.excerpt).toBe(line);
    expect(found[0]!.reason.length).toBeGreaterThan(10);
  });

  it('regras comuns não são acusadas, nem o commit em português no imperativo', () => {
    expect(
      findRuleConflicts(
        [
          'Mensagens de commit em português, no imperativo, sem ponto final.',
          'Rode npm run test antes de dizer que terminou.',
          'Não use any em TypeScript.',
          'Use o servidor de documentação do projeto.',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('assistente de regras: convenções e rascunho', () => {
  const profile: ProjectProfile = {
    languages: ['TypeScript'],
    scripts: { test: 'vitest run', lint: 'eslint .', dev: 'vite' },
    tools: ['eslint', 'prettier', 'sqlfluff'],
    folders: ['src', 'test', 'docs'],
    readme: 'App',
  };

  it('o perfil sugere linguagens, comandos conhecidos, ferramentas conhecidas e pastas; o perfil vazio, nada', () => {
    const items = conventionItems(profile);
    expect(items.map((i) => i.id)).toEqual(['languages', 'script:test', 'script:lint', 'tool:eslint', 'tool:prettier', 'folders']);
    expect(items.find((i) => i.id === 'script:test')!.text).toContain('`npm run test`');
    expect(items.find((i) => i.id === 'folders')!.params.list).toBe('src, test, docs');
    expect(conventionItems(EMPTY_PROFILE)).toEqual([]);
    expect(pathSuggestions(profile).map((p) => p.glob)).toEqual(['**/*.test.*', 'src/**', 'test/**', 'docs/**']);
  });

  it('a regra principal vira uma seção; a por assunto leva paths no Claude Code e globs no Cursor', () => {
    const items = conventionItems(profile).slice(0, 2);
    const main = draftRule('claude', { kind: 'main', paths: [] }, 'Commits em português.\nSem ponto final.', items);
    expect(main).toBe(
      [
        '## Regras do projeto',
        '',
        'Commits em português.',
        'Sem ponto final.',
        '',
        '## Convenções do projeto',
        `- ${items[0]!.text}`,
        `- ${items[1]!.text}`,
        '',
      ].join('\n'),
    );
    const claude = draftRule('claude', { kind: 'topic', paths: ['**/*.test.*', 'test/**'] }, 'Testes pequenos.', []);
    expect(claude).toBe(
      ['---', 'description: "Testes pequenos."', 'paths:', '  - "**/*.test.*"', '  - "test/**"', '---', '', '- Testes pequenos.', ''].join(
        '\n',
      ),
    );
    const cursor = draftRule('cursor', { kind: 'topic', paths: ['**/*.test.*', 'test/**'] }, 'Testes pequenos.', []);
    expect(cursor).toBe(
      [
        '---',
        'description: "Testes pequenos."',
        'globs: **/*.test.*, test/**',
        'alwaysApply: false',
        '---',
        '',
        '- Testes pequenos.',
        '',
      ].join('\n'),
    );
    // sem caminhos, a regra por assunto não leva paths nem globs
    expect(draftRule('claude', { kind: 'topic', paths: [] }, 'Tudo.', [])).not.toContain('paths');
  });
});

describe('assistente de skills: passos e SKILL.md', () => {
  it('o nome vem da tarefa e a descrição junta a tarefa ao gatilho', () => {
    expect(skillNameFromTask('Escrever uma migração nova do banco, subindo a versão do schema')).toBe('escrever-migracao-nova-banco');
    expect(skillDescription('Escrever uma migração nova.', 'o pedido falar de banco de dados')).toBe(
      'Escrever uma migração nova. Use quando o pedido falar de banco de dados.',
    );
    expect(skillDescription('Escrever uma migração nova', 'Use quando o pedido falar de banco')).toBe(
      'Escrever uma migração nova. Use quando o pedido falar de banco.',
    );
  });

  it('os passos propostos seguem os verbos da tarefa e os comandos do projeto', () => {
    const steps = proposeSkillSteps('Escrever uma migração nova do banco', { ...EMPTY_PROFILE, scripts: { test: 'x', typecheck: 'x' } });
    expect(steps[0]).toContain('Leia o pedido');
    expect(steps.join('\n')).toContain('mesmo tipo');
    expect(steps.join('\n')).toContain('esquema e das migrações');
    expect(steps.join('\n')).toContain('npm run typecheck');
    expect(steps.join('\n')).toContain('npm run test');
    expect(steps.join('\n')).not.toContain('npm run lint');
    expect(proposeSkillSteps('Qualquer coisa', EMPTY_PROFILE).length).toBeGreaterThanOrEqual(3);
  });

  it('o SKILL.md leva frontmatter, quando usar, passos numerados, limites e os arquivos de apoio', () => {
    const text = renderSkill({
      name: 'migracao',
      task: 'Escrever uma migração nova',
      trigger: 'o pedido falar de banco',
      steps: ['Leia a última', 'Escreva a nova'],
      limits: DEFAULT_SKILL_LIMITS.slice(0, 1),
      files: ['references/exemplo.md'],
    });
    expect(text).toContain('---\nname: migracao\ndescription: "Escrever uma migração nova. Use quando o pedido falar de banco."\n---');
    expect(text).toContain('## Quando usar\n\no pedido falar de banco.');
    expect(text).toContain('1. Leia a última\n2. Escreva a nova');
    expect(text).toContain('## O que nunca faz\n\n- Não altere arquivos fora do que a tarefa pede.');
    expect(text).toContain('- [references/exemplo.md](references/exemplo.md)');
  });
});
