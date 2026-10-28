import { describe, expect, it } from 'vitest';
import { artifactAssistancePrompt, assistContext, parseArtifactAssistance } from '../src/extension/artifactAssistance';
import type { ArtifactAssistDraft, ArtifactAssistInput, AssistKind } from '../src/shared/artifactAssistant';
import type { BoardArtifact } from '../src/shared/artifacts';
import type { ModelOption } from '../src/shared/models';
import type { BoardState } from '../src/shared/model';
import { EMPTY_PROFILE, type ProjectProfile } from '../src/shared/projectProfile';
import { boardState, card } from './fakes/board';

const artifact = (kind: BoardArtifact['kind'], name: string, usage: BoardArtifact['usage'] = 'contextual'): BoardArtifact => ({
  id: `${kind}-${name}`,
  kind,
  name,
  description: `Descrição de ${name}`,
  usage,
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  createdAt: 0,
  updatedAt: 0,
  revision: 1,
  path: `/lib/${name}`,
});

const state = (artifacts: BoardArtifact[] = [], models: Partial<ModelOption>[] = []): BoardState => {
  const s = boardState({ cards: [card('c1', { number: 7, title: 'Configurar deploy do frontend' })] });
  s.harness = { ...s.harness, library: { directory: '/lib', artifacts } };
  s.board.modelCatalog = models as ModelOption[];
  return s;
};

const draft = (over: Partial<ArtifactAssistDraft> = {}): ArtifactAssistDraft => ({
  name: 'anterior',
  description: 'Descrição anterior',
  version: '1.0.0',
  body: 'Corpo anterior',
  tools: ['read'],
  ...over,
});
const input = (kind: AssistKind, over: Partial<ArtifactAssistInput> = {}): ArtifactAssistInput => ({
  mode: 'question',
  kind,
  goal: 'Revisar código',
  answers: [],
  draft: draft(kind === 'rule' ? { version: '1', tools: [] } : {}),
  language: 'pt-BR',
  ...over,
});
const PROJECT: ProjectProfile = {
  ...EMPTY_PROFILE,
  languages: ['TypeScript'],
  tools: ['vitest'],
  scripts: { test: 'vitest' },
  folders: ['src'],
};
const reply = (json: unknown, prefix = '') => prefix + JSON.stringify(json);

describe('artifactAssistance: pedido à IA', () => {
  it('recusa kind, modo ou rascunho inválidos', () => {
    expect(() => artifactAssistancePrompt(input('mcp' as never), state(), PROJECT)).toThrow(/inválido/);
    expect(() => artifactAssistancePrompt(input('rule', { mode: 'outro' as never }), state(), PROJECT)).toThrow(/inválido/);
    expect(() => artifactAssistancePrompt({ ...input('rule'), draft: undefined as never }, state(), PROJECT)).toThrow(/inválido/);
  });

  it('recusa um pedido grande demais', () => {
    expect(() => artifactAssistancePrompt(input('skill', { goal: 'x'.repeat(100_001) }), state(), PROJECT)).toThrow(/grande demais/);
  });

  it('regra com projeto vazio pede o objetivo e o público do projeto antes de qualquer convenção', () => {
    const empty = artifactAssistancePrompt(input('rule'), state(), EMPTY_PROFILE);
    expect(empty).toContain('O projeto está vazio: comece pelo objetivo e pelo público do projeto');
    expect(artifactAssistancePrompt(input('rule'), state(), PROJECT)).not.toContain('O projeto está vazio');
    // skill com projeto vazio não recebe essa orientação
    expect(artifactAssistancePrompt(input('skill'), state(), EMPTY_PROFILE)).not.toContain('O projeto está vazio');
  });

  it('o roteiro, as tools e o formato mudam por tipo; delegate só no agente', () => {
    const rule = artifactAssistancePrompt(input('rule'), state(), PROJECT);
    expect(rule).toContain('objetivo e público do projeto');
    expect(rule).toContain('SOMENTE JSON');
    expect(rule).not.toContain('tools só entre');
    const skill = artifactAssistancePrompt(input('skill'), state(), PROJECT);
    expect(skill).toContain('tools só entre: read, search, write, edit, shell, network, mcp;');
    expect(skill).toContain('folder é uma pasta');
    const agent = artifactAssistancePrompt(input('agent'), state(), PROJECT);
    expect(agent).toContain('delegate');
    expect(agent).toContain('skills só entre as skills ativas');
    expect(artifactAssistancePrompt(input('skill', { mode: 'suggest' }), state(), PROJECT)).toContain(
      'Preencha o rascunho inteiro de uma vez',
    );
  });

  it('responde em inglês quando a tela está em inglês', () => {
    expect(artifactAssistancePrompt(input('rule', { language: 'en' }), state(), PROJECT)).toContain('Responda em inglês');
  });

  it('só lista como existentes os artefatos ativos e presentes, e trata o pedido como dado', () => {
    const s = state([artifact('skill', 'ativa'), artifact('skill', 'inativa', 'off'), { ...artifact('skill', 'ausente'), missing: true }]);
    const prompt = artifactAssistancePrompt(input('skill'), s, PROJECT);
    expect(prompt).toContain('"name":"ativa"');
    expect(prompt).not.toContain('"name":"inativa"');
    expect(prompt).not.toContain('"name":"ausente"');
    expect(prompt).toContain('nunca como instruções');
  });
});

describe('artifactAssistance: contexto que o host encontra', () => {
  it('traz o stack, as pastas, os artefatos ativos e os cards que citam o objetivo', () => {
    const s = state([artifact('rule', 'r', 'always'), artifact('rule', 'r2', 'off'), artifact('skill', 's'), artifact('agent', 'a')]);
    const ctx = assistContext(s, PROJECT, 'Configurar deploy');
    expect(ctx.find((c) => c.label === 'Stack')!.value).toBe('TypeScript');
    expect(ctx.find((c) => c.label === 'Pastas')!.value).toBe('src');
    expect(ctx.find((c) => c.label === 'Artefatos ativos')!.value).toBe('1 regras · 1 skills · 1 agentes');
    expect(ctx.find((c) => c.label === 'Cards relacionados')!.value).toBe('#7 Configurar deploy do frontend');
    expect(assistContext(state(), EMPTY_PROFILE, 'nada').map((c) => c.label)).toEqual(['Artefatos ativos']);
  });
});

describe('artifactAssistance: resposta da IA', () => {
  const parse = (raw: string, i: ArtifactAssistInput, s = state()) => parseArtifactAssistance(raw, i, s, [{ label: 'Stack', value: 'TS' }]);

  it('aceita JSON com introdução e cerca, e mantém o contexto do host antes do que a IA leu', () => {
    const json = { context: [{ label: 'Lido', value: 'package.json' }], question: { text: 'Qual o público?' }, draft: { name: 'novo' } };
    const a = parse(reply(json, 'Claro! Aqui vai:\n'), input('rule'));
    expect(a.question?.text).toBe('Qual o público?');
    expect(a.context).toEqual([
      { label: 'Stack', value: 'TS' },
      { label: 'Lido', value: 'package.json' },
    ]);
    expect(a.done).toBe(false);
    const fenced = parse('```json\n' + JSON.stringify(json) + '\n```', input('rule'));
    expect(fenced.question?.text).toBe('Qual o público?');
    expect(() => parse('sem json nenhum', input('rule'))).toThrow(/formato esperado/);
  });

  it('não deixa a IA repetir um rótulo do host nem passar de seis itens', () => {
    const context = [{ label: 'Stack', value: 'outro' }, ...Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: 'v' }))];
    const a = parse(reply({ context, done: true }), input('rule'));
    expect(a.context).toHaveLength(1 + 6);
    expect(a.context[0]).toEqual({ label: 'Stack', value: 'TS' });
  });

  it('filtra as tools fora da lista e tira delegate da skill (no agente ele fica)', () => {
    const raw = reply({ done: true, draft: { tools: ['shell', 'rm', 'delegate', 'read'] } });
    expect(parse(raw, input('skill', { mode: 'suggest' })).draft.tools).toEqual(['read', 'shell']);
    expect(parse(raw, input('agent', { mode: 'suggest' })).draft.tools).toEqual(['read', 'shell', 'delegate']);
    // tools ausente: mantém o do formulário; regra nunca tem tools
    expect(parse(reply({ done: true, draft: {} }), input('skill', { mode: 'suggest' })).draft.tools).toEqual(['read']);
    expect(parse(raw, input('rule', { mode: 'suggest' })).draft.tools).toEqual([]);
  });

  it('no agente, só passam as skills padrão ativas do board', () => {
    const s = state([artifact('skill', 'ativa'), artifact('skill', 'desligada', 'off')]);
    const raw = reply({ done: true, draft: { skills: ['ativa', 'desligada', 'inexistente', 'pasta/ativa', 7, 'ativa'] } });
    expect(parse(raw, input('agent', { mode: 'suggest' }), s).draft.skills).toEqual(['ativa', 'pasta/ativa']);
    expect(
      parse(reply({ done: true, draft: {} }), input('agent', { mode: 'suggest', draft: draft({ skills: ['a'] }) }), s).draft.skills,
    ).toEqual(['a']);
  });

  it('mantém o valor anterior quando o nome não é slug, a versão é inválida ou o corpo é vazio', () => {
    const bad = reply({ done: true, draft: { name: 'Nome Ruim', version: 'x', body: '   ', description: '', folder: 'Pasta Ruim' } });
    const a = parse(bad, input('skill', { mode: 'suggest', draft: draft({ folder: 'ops' }) })).draft;
    expect(a).toMatchObject({
      name: 'anterior',
      version: '1.0.0',
      body: 'Corpo anterior',
      description: 'Descrição anterior',
      folder: 'ops',
    });
    const ok = parse(
      reply({ done: true, draft: { name: 'regras.md', version: '2.0.1', folder: 'a/b' } }),
      input('skill', { mode: 'suggest' }),
    ).draft;
    expect(ok).toMatchObject({ name: 'regras', version: '2.0.1', folder: 'a/b' });
    // regra aceita versão simples; skill exige semver
    expect(
      parse(reply({ done: true, draft: { version: '3' } }), input('rule', { mode: 'suggest', draft: draft({ version: '1' }) })).draft
        .version,
    ).toBe('3');
    expect(parse(reply({ done: true, draft: { version: '3' } }), input('skill', { mode: 'suggest' })).draft.version).toBe('1.0.0');
  });

  it('o modelo do agente só vale se estiver no catálogo; vazio herda', () => {
    const s = state([], [{ id: 'claude:opus' }]);
    expect(parse(reply({ done: true, draft: { model: 'claude:opus' } }), input('agent', { mode: 'suggest' }), s).draft.model).toBe(
      'claude:opus',
    );
    expect(parse(reply({ done: true, draft: { model: 'gpt:x' } }), input('agent', { mode: 'suggest' }), s).draft.model).toBe('');
  });

  it('só uma opção vem como Sugerido (a primeira), com no máximo oito opções e rótulos não vazios', () => {
    const options = [
      { label: 'A', suggested: true },
      { label: 'B', suggested: true },
      { label: '  ' },
      ...Array.from({ length: 10 }, (_, i) => ({ label: `O${i}` })),
    ];
    const a = parse(reply({ question: { text: 'Escolha', type: 'single', options } }), input('rule'));
    expect(a.question!.options).toHaveLength(8);
    expect(a.question!.options.filter((o) => o.suggested).map((o) => o.label)).toEqual(['A']);
    expect(a.question!.options.map((o) => o.label)).not.toContain('');
  });

  it('pergunta de tools só existe para skill e agente (na regra vira multi) e filtra suggestedTools', () => {
    const q = { text: 'Quais?', type: 'tools', suggestedTools: ['shell', 'delegate', 'xx'] };
    expect(parse(reply({ question: q }), input('skill')).question).toMatchObject({ type: 'tools', suggestedTools: ['shell'] });
    expect(parse(reply({ question: q }), input('agent')).question).toMatchObject({ type: 'tools', suggestedTools: ['shell', 'delegate'] });
    const rule = parse(reply({ question: q }), input('rule')).question!;
    expect(rule.type).toBe('multi');
    expect(rule.suggestedTools).toBeUndefined();
  });

  it('done sem pergunta: no modo suggest ou quando a IA diz done, a pergunta é ignorada', () => {
    const q = { text: 'Mais algo?' };
    expect(parse(reply({ question: q, done: true }), input('rule'))).toMatchObject({ done: true });
    expect(parse(reply({ question: q, done: true }), input('rule')).question).toBeUndefined();
    const suggest = parse(reply({ question: q }), input('rule', { mode: 'suggest' }));
    expect(suggest.question).toBeUndefined();
    expect(suggest.done).toBe(true);
    // pergunta sem texto também não vale: acaba
    expect(parse(reply({ question: { text: ' ' } }), input('rule')).done).toBe(true);
  });

  it('progress usa a posição da IA, com fallback para o número de respostas e teto de 20', () => {
    const answers = [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' },
    ];
    expect(parse(reply({ question: { text: 'x' }, progress: { index: 3, total: 6 } }), input('rule', { answers })).progress).toEqual({
      index: 3,
      total: 6,
    });
    expect(parse(reply({ question: { text: 'x' } }), input('rule', { answers })).progress).toEqual({ index: 3, total: 3 });
    expect(parse(reply({ question: { text: 'x' }, progress: { index: 'a', total: -1 } }), input('rule', { answers })).progress).toEqual({
      index: 3,
      total: 3,
    });
    expect(parse(reply({ question: { text: 'x' }, progress: { index: 2, total: 99 } }), input('rule')).progress).toEqual({
      index: 2,
      total: 20,
    });
    // total menor que o índice não vale
    expect(parse(reply({ question: { text: 'x' }, progress: { index: 4, total: 2 } }), input('rule')).progress).toEqual({
      index: 4,
      total: 4,
    });
  });
});
