import { describe, expect, it } from 'vitest';
import {
  canaryLine,
  contextScopeState,
  discoveryPrompt,
  importedReference,
  isBoardReference,
  leakGroups,
  leakOrigin,
  leakTokens,
  mergedReference,
  normalizeLocationPath,
  overlapOf,
  parseUninstall,
  ruleNameFor,
  uninstallPrompt,
  unresolvablePath,
  parseDiscovery,
  pickQuoteLine,
  quoteProbe,
  quoted,
  verificationPrompt,
  type ContextScopeReport,
} from '../src/shared/contextScope';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('contexto do card: descoberta', () => {
  it('o pedido traz o exemplo de uma ferramenta fictícia, para o agente não copiar nomes reais', () => {
    const prompt = discoveryPrompt();
    expect(prompt).toContain('"Foo CLI"');
    expect(prompt).toContain('NÃO copie os nomes dele');
    expect(prompt).not.toMatch(/CLAUDE\.md|AGENTS\.md|GEMINI\.md/);
  });

  it('lê o JSON no meio do raciocínio, limpa as notas do caminho e decide o escopo pelo caminho', () => {
    // a saída do Kimi Code 2.3.0, resumida: raciocínio, depois o JSON com marcador e recuo
    const text = `• O usuário pede a lista. Vou responder só o JSON.
• {"tool": "Kimi Code CLI", "locations": [
    {"path": "AGENTS.md", "scope": "project", "kind": "instructions", "loads": "always"},
    {"path": "~/.kimi-code/AGENTS.md", "scope": "project", "kind": "instructions", "loads": "always"},
    {"path": ".kimi-code/config.toml (seção [hooks])", "scope": "project", "kind": "hook", "loads": "always"},
    {"path": "\`.kimi-code/skills/*/SKILL.md\`", "scope": "project", "kind": "skill", "loads": "on-demand"},
    {"path": "AGENTS.md", "scope": "project", "kind": "instructions", "loads": "always"},
    {"path": "~/.x/<projeto>/MEMORY.md", "scope": "user", "kind": "nao-sei", "loads": "talvez"}
  ]}`;
    expect(parseDiscovery(text)).toEqual([
      { path: 'AGENTS.md', scope: 'project', kind: 'instructions', loads: 'always', source: 'agent' },
      // "~/" é da pasta do usuário, mesmo com o agente dizendo "project"
      { path: '~/.kimi-code/AGENTS.md', scope: 'user', kind: 'instructions', loads: 'always', source: 'agent' },
      { path: '.kimi-code/config.toml', scope: 'project', kind: 'hook', loads: 'always', source: 'agent' },
      { path: '.kimi-code/skills/*/SKILL.md', scope: 'project', kind: 'skill', loads: 'on-demand', source: 'agent' },
      { path: '~/.x/<projeto>/MEMORY.md', scope: 'user', kind: 'instructions', loads: 'always', source: 'agent' },
    ]);
  });

  it('sem JSON com "locations" não há lista; a lista vazia é uma resposta válida', () => {
    expect(parseDiscovery('Não sei dizer.')).toBeNull();
    expect(parseDiscovery('{"tool": "?", "locations": []}')).toEqual([]);
    expect(normalizeLocationPath('./CLAUDE.md')).toBe('CLAUDE.md');
    // descrição no lugar do caminho: fica sem teste, não vira isca
    expect(unresolvablePath('(instalação da CLI)/skills')).toBe(true);
    expect(unresolvablePath('.kimi-code/skills/*/SKILL.md')).toBe(false);
  });
});

describe('contexto do card: citação', () => {
  it('na skill cita a descrição do cabeçalho; num arquivo comum, uma das linhas longas', () => {
    const skill = '---\nname: x\ndescription: Use ao revisar o diff da branch antes de abrir o pull request\n---\ncurto';
    expect(pickQuoteLine(skill, 'skill')).toBe('Use ao revisar o diff da branch antes de abrir o pull request');
    const doc = '# Título\ncurta demais\n- Toda história que muda o comportamento da execução ganha um cenário novo em test\n```';
    expect(pickQuoteLine(doc, 'instructions', seq(0))).toBe(
      '- Toda história que muda o comportamento da execução ganha um cenário novo em test',
    );
    expect(pickQuoteLine('# só um título\nnada', 'instructions')).toBeNull();
    // arquivo de instrução curto: com 8 palavras, o começo tem 4 e o resto 4
    const short = 'Código de verificação deste arquivo: ARQUIVO-4471 cachorro azul.';
    expect(pickQuoteLine(short, 'instructions')).toBe(short);
    expect(quoteProbe('t1', short)).toMatchObject({ head: 'Código de verificação deste', tail: 'arquivo: ARQUIVO-4471 cachorro azul.' });
  });

  it('o agente recebe o começo da linha e prova que a leu devolvendo o resto, com ou sem marcação', () => {
    const probe = quoteProbe('t1', '- Toda história que muda o comportamento da execução ganha um cenário novo');
    expect(probe).toEqual({ id: 't1', head: 'Toda história que muda o', tail: 'comportamento da execução ganha um cenário novo' });
    expect(quoted('t1: **Toda história que muda o comportamento da   execução ganha um cenário novo**', probe)).toBe(true);
    expect(quoted('t1: Toda história que muda o', probe)).toBe(false);
    expect(quoted('t1: NÃO ENCONTREI', probe)).toBe(false);
  });

  it('o pedido leva o bloco de controle e a lista com o controle no meio; a isca tem palavras ao acaso', () => {
    const line = canaryLine(seq(0.1, 0.5, 0.9));
    expect(line).toMatch(/^Faz-[0-9a-f]{6} (\S+ ){8}fim-[0-9a-f]{6}\.$/);
    // o começo pedido e o resto que prova a leitura levam um código cada
    expect(quoteProbe('t0', line).head).toMatch(/^Faz-/);
    expect(quoteProbe('t0', line).tail).toMatch(/fim-[0-9a-f]{6}\.$/);
    const control = { line, probe: quoteProbe('t0', line) };
    const prompt = verificationPrompt([quoteProbe('t1', 'a b c d e f g h i j'), quoteProbe('t2', 'k l m n o p q r s t')], control);
    expect(prompt).toContain('Não use nenhuma ferramenta');
    expect(prompt).toContain(`Bloco de controle:\n${line}`);
    expect(
      prompt
        .split('Trechos:')[1]!
        .trim()
        .split('\n')
        .map((l) => l.split(':')[0]),
    ).toEqual(['t1', 't0', 't2']);
  });
});

describe('contexto do card: estado', () => {
  const report = (states: ('controlled' | 'leaks' | 'untested')[], control = true): ContextScopeReport => ({
    profileId: 'claude',
    version: '2.1.296',
    at: 0,
    discovered: true,
    control,
    locations: states.map((state, i) => ({
      path: `f${i}`,
      scope: 'project',
      kind: 'instructions',
      loads: 'always',
      source: 'agent',
      verdict:
        state === 'leaks'
          ? { state, how: 'quote', files: [`f${i}`] }
          : state === 'controlled'
            ? { state, how: 'quote' }
            : { state, reason: 'missing-user' },
    })),
  });

  it('aberto se algum local vaza; fechado só com o controle e algum local conferido; o resto não verificado', () => {
    expect(contextScopeState(undefined)).toBe('unverified');
    expect(contextScopeState(report(['controlled', 'untested']))).toBe('closed');
    expect(contextScopeState(report(['controlled', 'leaks']))).toBe('open');
    // a citação certa é prova de vazamento mesmo sem o controle
    expect(contextScopeState(report(['leaks'], false))).toBe('open');
    expect(contextScopeState(report(['controlled'], false))).toBe('unverified');
    expect(contextScopeState(report(['untested']))).toBe('unverified');
  });
});

describe('contexto do card: o que fazer com o que vaza', () => {
  const leaking = (files: string[], over: Partial<ContextScopeReport['locations'][number]> = {}) => ({
    path: '~/.kimi-code/skills/*/SKILL.md',
    scope: 'user' as const,
    kind: 'skill' as const,
    loads: 'on-demand' as const,
    source: 'agent' as const,
    verdict: { state: 'leaks' as const, how: 'quote' as const, files, tokens: files.map(() => 10) },
    ...over,
  });

  it('a origem de cada arquivo decide a sugestão: cópia antiga do Faz AI, plugin, pasta pessoal ou projeto', () => {
    const loc = leaking([
      '~/.kimi-code/skills/faz-ai-fluxo/SKILL.md',
      '~/.kimi-code/plugins/managed/br/skills/api/SKILL.md',
      '~/.kimi-code/skills/minha-skill/SKILL.md',
      '~/.kimi-code/skills/faz-ai-modo-autonomo/SKILL.md',
    ]);
    expect(leakGroups(loc)).toEqual([
      {
        origin: { kind: 'faz-ai-copy' },
        files: ['~/.kimi-code/skills/faz-ai-fluxo/SKILL.md', '~/.kimi-code/skills/faz-ai-modo-autonomo/SKILL.md'],
        tokens: 20,
      },
      { origin: { kind: 'plugin', plugin: 'br' }, files: ['~/.kimi-code/plugins/managed/br/skills/api/SKILL.md'], tokens: 10 },
      { origin: { kind: 'user-skill' }, files: ['~/.kimi-code/skills/minha-skill/SKILL.md'], tokens: 10 },
    ]);
    expect(leakTokens(loc)).toBe(40);
    expect(leakOrigin('AGENTS.md', { scope: 'project', kind: 'instructions' })).toEqual({ kind: 'project' });
    // a referência que o board deixou não pede mais ação
    const ref = leaking(['AGENTS.md'], { path: 'AGENTS.md', scope: 'project', kind: 'instructions' });
    expect(leakGroups({ ...ref, verdict: { state: 'leaks', how: 'quote', files: ['AGENTS.md'], refs: [true] } })[0]!.origin).toEqual({
      kind: 'board-reference',
    });
    expect(isBoardReference(importedReference('agents'))).toBe(true);
    expect(isBoardReference(mergedReference('AGENTS.md', 'CLAUDE.md'))).toBe(true);
    expect(isBoardReference('# Regras do projeto\nRode os testes.')).toBe(false);
    // a instrução herdada de uma pasta acima do projeto não é do projeto: o board não mexe nela
    expect(leakOrigin('../CLAUDE.md', { scope: 'project', kind: 'instructions' })).toEqual({ kind: 'user-instructions' });
  });

  it('as frações de linhas repetidas dizem se um arquivo cabe inteiro no outro', () => {
    const agents =
      'Rode os testes antes de concluir a história.\nUse português nos comentários do código.\nNão publique sem a pessoa pedir.';
    const claude = 'Rode os testes antes de concluir a história.\nUse português nos comentários do código.';
    expect(overlapOf(agents, claude)).toEqual({ aInB: 2 / 3, bInA: 1 });
    expect(overlapOf('# título', agents)).toBeNull();
  });

  it('o nome da regra sai do caminho, e as referências apontam o arquivo certo (o CLAUDE.md importa com @)', () => {
    expect(ruleNameFor('AGENTS.md')).toBe('agents');
    expect(ruleNameFor('.cursor/rules/Regra Ação.mdc')).toBe('cursor-rules-regra-acao');
    expect(importedReference('agents')).toContain('regra "agents" do board Faz AI');
    expect(mergedReference('AGENTS.md', 'CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(mergedReference('AGENTS.md', '.claude/CLAUDE.md')).toBe('@../AGENTS.md\n');
    expect(mergedReference('AGENTS.md', 'KIMI.md')).toBe('As instruções deste projeto estão em AGENTS.md.\n');
  });

  it('o comando de desinstalar vem da última linha da resposta; "não sei" vira nada', () => {
    expect(uninstallPrompt('br')).toContain('desinstalar o plugin "br"');
    expect(parseUninstall('• Pensando no comando...\n`kimi plugin remove br`')).toBe('kimi plugin remove br');
    expect(parseUninstall('NÃO SEI')).toBeNull();
    expect(parseUninstall('• NÃO SEI\n\nTo resume this session: kimi -r session_1')).toBeNull();
  });
});
