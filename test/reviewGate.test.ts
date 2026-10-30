// O portão da revisão independente (#1324): o fechamento da sub-tarefa de revisão exige veredito válido e grava a
// rodada, a rodada 2+ nasce com o bloco "Rodada N", a história só sai da Revisão com a última rodada APROVADO (3ª sem
// APROVADO bloqueia) e a mão da pessoa nunca passa pelo portão. A história é real (`storyWorld`) e o servidor MCP também.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/extension/mcp/server';
import { ReviewRoundRepo } from '../src/extension/repositories/reviewRoundRepo';
import { storyWorld, type StoryWorld } from './scenarios/storyWorld';

let world: StoryWorld | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const OK = (n = 'nada') => `Não checado: ${n}`;
const APROVADO = `Tudo certo.\n${OK()}\nVEREDITO: APROVADO`;
const REPROVADO = `- A1 [bloqueia] src/a.ts:10: falta validar a entrada\n${OK()}\nVEREDITO: REPROVADO`;
const NAO_COMPROVADO = `- A1 [bloqueia] src/a.ts:10: falta validar a entrada [RESOLVIDO]\nNão checado:\n- o teste de integração\nVEREDITO: NÃO COMPROVADO`;
const APROVADO_2 = `- A1 [bloqueia] src/a.ts:10: falta validar a entrada [RESOLVIDO]\n${OK()}\nVEREDITO: APROVADO`;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

/** A história na Revisão, o projeto como repositório git, o agente `revisor-de-codigo` e o cliente MCP da IA. */
async function scenario(options: { git?: boolean } = {}) {
  const w = (world = await storyWorld(() => {}));
  if (options.git !== false) {
    git(w.project, 'init', '-q');
    fs.writeFileSync(path.join(w.project, 'a.txt'), '1');
    git(w.project, 'add', '.');
    git(w.project, 'commit', '-q', '-m', 'um');
  }
  w.router.handle({
    type: 'harness.agent.create',
    input: {
      name: 'revisor-de-codigo',
      description: 'Revisão de código.',
      body: 'Revise o diff.',
      model: '',
      tools: ['Read', 'Bash'],
      deniedTools: [],
      skills: [],
      mcp: [],
    },
  });
  const s0 = w.router.snapshot();
  const parent = s0.workflows.find((x) => x.kind === 'parent')!;
  const col = (name: string, kind: 'parent' | 'child' = 'parent') => {
    const wf = s0.workflows.find((x) => x.kind === kind)!;
    return s0.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
  };
  void parent;
  w.router.handle({ type: 'card.move', cardId: w.storyId, columnId: col('Revisão').id, position: Number.MAX_SAFE_INTEGER });

  const server = createMcpServer({
    getRouter: async () => w.router,
    getRunner: async () => w.runner,
    workspaceDir: w.project,
    version: 'test',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);

  const snap = () => w.router.snapshot();
  const story = () => snap().cards.find((c) => c.id === w.storyId)!;
  const call = (name: string, args: Record<string, unknown>) => client!.callTool({ name, arguments: args });
  const text = (res: Awaited<ReturnType<typeof call>>): string => JSON.stringify(res.content);
  /** a IA cria a sub-tarefa de revisão (com o agente, salvo `profile: false`) */
  const createReview = async (title: string, withAgent = true) => {
    const res = await call('create_card', {
      title,
      parent: story().number,
      description: 'Revise a história.',
      ...(withAgent ? { profile: 'revisor-de-codigo' } : {}),
      fields: { Fase: 'Revisão' },
    });
    expect(res.isError, JSON.stringify(res.content)).not.toBe(true);
    return snap().cards.find((c) => c.title === title)!;
  };
  const closeReview = (card: { number: number }, comment?: string) =>
    call('move_card', { card: card.number, column: 'Concluído', ...(comment ? { comment } : {}) });
  const exitStory = () => call('move_card', { card: story().number, column: 'Homologação' });
  const rounds = () => new ReviewRoundRepo(w.db).listForStory(w.storyId);
  const columnName = (id: string) => {
    const s = snap();
    return s.columns.find((c) => c.id === s.cards.find((x) => x.id === id)!.columnId)!.name;
  };
  const commit = (file: string) => {
    fs.writeFileSync(path.join(w.project, file), file);
    git(w.project, 'add', '.');
    git(w.project, 'commit', '-q', '-m', file);
    return git(w.project, 'rev-parse', 'HEAD');
  };
  return { w, snap, story, call, text, createReview, closeReview, exitStory, rounds, columnName, commit, col };
}

describe('portão da revisão independente', () => {
  it('fechar a revisão sem veredito é recusado e a sub-tarefa segue onde estava, sem rodada', async () => {
    const { createReview, closeReview, rounds, columnName, text } = await scenario();
    const review = await createReview('Revisar 1');
    const res = await closeReview(review, 'Li tudo, está bom.');
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('VEREDITO');
    expect(columnName(review.id)).not.toBe('Concluído');
    expect(rounds()).toHaveLength(0);
  });

  it('o veredito inconsistente (APROVADO com item não checado) também é recusado com o motivo', async () => {
    const { createReview, closeReview, rounds, text } = await scenario();
    const review = await createReview('Revisar 1');
    const res = await closeReview(review, 'Não checado:\n- o teste de integração\nVEREDITO: APROVADO');
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Não checado: nada');
    expect(rounds()).toHaveLength(0);
  });

  it('o veredito válido move a sub-tarefa e grava a rodada com o HEAD, os modelos e a independência', async () => {
    const { w, createReview, closeReview, rounds, columnName } = await scenario();
    const review = await createReview('Revisar 1');
    const head = git(w.project, 'rev-parse', 'HEAD');
    const res = await closeReview(review, REPROVADO);
    expect(res.isError, JSON.stringify(res.content)).not.toBe(true);
    expect(columnName(review.id)).toBe('Concluído');
    const [r] = rounds();
    expect(r).toMatchObject({ round: 1, verdict: 'REPROVADO', headSha: head, subtaskId: review.id, storyId: w.storyId });
    expect(r!.findings).toEqual([expect.objectContaining({ id: 'A1', severity: 'bloqueia', where: 'src/a.ts:10' })]);
    expect(r!.unchecked).toEqual([]);
  });

  it('git falhando ao ler o HEAD recusa o fechamento com mensagem clara e não grava rodada', async () => {
    const { createReview, closeReview, rounds, columnName, text } = await scenario({ git: false });
    const review = await createReview('Revisar 1');
    const res = await closeReview(review, APROVADO);
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('commit atual (HEAD)');
    expect(columnName(review.id)).not.toBe('Concluído');
    expect(rounds()).toHaveLength(0);
  });

  it('a revisão sem o agente revisor-de-codigo fica sem rodada e sem portão (RF9)', async () => {
    const { createReview, closeReview, rounds, exitStory, columnName, story, col, snap } = await scenario();
    const review = await createReview('Revisar 1', false);
    expect((await closeReview(review, 'Sem veredito algum.')).isError).not.toBe(true);
    expect(columnName(review.id)).toBe('Concluído');
    expect(rounds()).toHaveLength(0);
    expect((await exitStory()).isError).not.toBe(true);
    expect(snap().cards.find((c) => c.id === story().id)!.columnId).toBe(col('Homologação').id);
  });

  it('a rodada 2 nasce com o bloco "Rodada N": os achados anteriores e o git diff do sha anterior até o HEAD', async () => {
    const { w, createReview, closeReview, commit, snap } = await scenario();
    const first = await createReview('Revisar 1');
    expect(snap().cards.find((c) => c.id === first.id)!.description).not.toContain('Rodada');
    const before = git(w.project, 'rev-parse', 'HEAD');
    await closeReview(first, REPROVADO);
    commit('b.txt');
    const second = await createReview('Revisar 2');
    const description = snap().cards.find((c) => c.id === second.id)!.description;
    expect(description.startsWith('Revise a história.')).toBe(true);
    expect(description).toContain('## Rodada 2');
    expect(description).toContain('- A1 [bloqueia] src/a.ts:10: falta validar a entrada');
    expect(description).toContain(`git diff ${before}...HEAD`);
  });

  it('o sha anterior que não é ancestral do HEAD (rebase) manda revisar o diff inteiro', async () => {
    const { w, createReview, closeReview, snap } = await scenario();
    const first = await createReview('Revisar 1');
    await closeReview(first, REPROVADO);
    // reescreve a história: o commit da rodada 1 deixa de ser ancestral
    git(w.project, 'commit', '-q', '--amend', '-m', 'reescrito');
    const second = await createReview('Revisar 2');
    const description = snap().cards.find((c) => c.id === second.id)!.description;
    expect(description).toContain('## Rodada 2');
    expect(description).toContain('não é ancestral do HEAD');
    expect(description).toContain('diff inteiro');
    expect(description).not.toContain('git diff');
  });

  it('a rodada 2+ exige repetir cada achado anterior com o status', async () => {
    const { createReview, closeReview, commit, rounds, text } = await scenario();
    await closeReview(await createReview('Revisar 1'), REPROVADO);
    commit('b.txt');
    const second = await createReview('Revisar 2');
    const res = await closeReview(second, APROVADO);
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('A1');
    expect(rounds()).toHaveLength(1);
  });

  it('a história só sai da Revisão com a última rodada APROVADO', async () => {
    const { createReview, closeReview, commit, exitStory, story, col, snap, rounds, text } = await scenario();
    await closeReview(await createReview('Revisar 1'), REPROVADO);
    const res = await exitStory();
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('REPROVADO');
    expect(story().columnId).not.toBe(col('Homologação').id);

    commit('b.txt');
    await closeReview(await createReview('Revisar 2'), NAO_COMPROVADO);
    expect((await exitStory()).isError).toBe(true);

    commit('c.txt');
    await closeReview(await createReview('Revisar 3'), APROVADO_2);
    expect(rounds().map((r) => r.verdict)).toEqual(['REPROVADO', 'NÃO COMPROVADO', 'APROVADO']);
    expect((await exitStory()).isError).not.toBe(true);
    expect(snap().cards.find((c) => c.id === story().id)!.columnId).toBe(col('Homologação').id);
  });

  it('a 3ª rodada sem APROVADO bloqueia a história para a pessoa', async () => {
    const { createReview, closeReview, commit, exitStory, story, text } = await scenario();
    await closeReview(await createReview('Revisar 1'), REPROVADO);
    commit('b.txt');
    await closeReview(await createReview('Revisar 2'), NAO_COMPROVADO);
    commit('c.txt');
    await closeReview(await createReview('Revisar 3'), NAO_COMPROVADO);
    const res = await exitStory();
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('3ª rodada');
    expect(story().status).toBe('blocked');
  });

  it('a mão da pessoa é livre: mover a sub-tarefa e a história pela interface não passa pelo portão', async () => {
    const { w, createReview, closeReview, exitStory, story, col, snap, rounds } = await scenario();
    await closeReview(await createReview('Revisar 1'), REPROVADO);
    expect(rounds()).toHaveLength(1);
    // a pessoa leva a história adiante e fecha uma revisão sem veredito: nada é recusado nem gravado
    const second = await createReview('Revisar 2');
    w.router.handle({ type: 'card.move', cardId: second.id, columnId: col('Concluído', 'child').id, position: Number.MAX_SAFE_INTEGER });
    expect(rounds()).toHaveLength(1);
    expect((await exitStory()).isError).toBe(true);
    w.router.handle({ type: 'card.move', cardId: story().id, columnId: col('Homologação').id, position: Number.MAX_SAFE_INTEGER });
    expect(snap().cards.find((c) => c.id === story().id)!.columnId).toBe(col('Homologação').id);
  });
});
