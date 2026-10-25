import { describe, expect, it } from 'vitest';
import {
  canaryLine,
  contextScopeState,
  discoveryPrompt,
  normalizeLocationPath,
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
