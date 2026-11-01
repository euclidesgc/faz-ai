import fs from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AGENT_SEEDS } from '../src/extension/agentSeeds';
import { FLOW_SKILLS } from '../src/extension/flowSkill';
import { REVIEW_NOTE, cardDetail } from '../src/extension/mcp/format';
import type { BoardState } from '../src/shared/model';

// O veredito da revisão independente (#1324): o que a skill da Revisão manda fazer com cada veredito, o formato do
// relatório (na nota de revisão do get_card) e o agente que o escreve.

const revisao = FLOW_SKILLS.find((s) => s.name === 'faz-ai-revisao-e-homologacao')!.body;

describe('veredito da revisão independente: a skill', () => {
  it('o veredito manda na rodada: só APROVADO segue para a saída; REPROVADO e NÃO COMPROVADO criam a rodada seguinte', () => {
    expect(revisao).toMatch(/O veredito manda na rodada: `APROVADO` segue para o passo 4; `REPROVADO` ou `NÃO COMPROVADO` não/);
    expect(revisao).toMatch(/crie a sub-tarefa de revisão da rodada\s+seguinte, cuja descrição traz o bloco `Rodada N`/);
  });

  it('a terceira rodada sem APROVADO bloqueia a história para a pessoa decidir', () => {
    expect(revisao).toMatch(/Depois de três rodadas sem\s+`APROVADO`, o board bloqueia a história e a pessoa decide/);
  });

  it('com a revisão do revisor-de-codigo, só o APROVADO da última rodada libera a saída', () => {
    expect(revisao).toMatch(/só o `APROVADO` da última rodada libera a saída: sem ele, o board recusa o movimento/);
  });

  it('o formato do relatório fica na nota do get_card: a skill só aponta para ela', () => {
    expect(revisao).toContain('nota de revisão do `get_card`');
    expect(revisao).not.toContain('VEREDITO: APROVADO');
  });
});

describe('veredito da revisão independente: a nota e o agente', () => {
  it('a nota traz a ordem do relatório, os ids com [RESOLVIDO] na rodada 2 e o VEREDITO como última linha', () => {
    expect(REVIEW_NOTE).toContain('`- A1 [bloqueia] arquivo:linha: texto`');
    expect(REVIEW_NOTE).toContain(
      'na rodada 2 ou depois, cada id do bloco "Rodada N" da descrição volta com [RESOLVIDO] ou [NÃO RESOLVIDO]',
    );
    expect(REVIEW_NOTE).toContain('`Não checado: nada`');
    expect(REVIEW_NOTE).toContain('como última linha');
  });

  it('a nota diz o que cada veredito exige', () => {
    expect(REVIEW_NOTE).toContain('`VEREDITO: APROVADO`, `VEREDITO: REPROVADO` ou `VEREDITO: NÃO COMPROVADO`');
    expect(REVIEW_NOTE).toMatch(/APROVADO exige nenhum bloqueia e nada não checado/);
    expect(REVIEW_NOTE).toMatch(/REPROVADO, ao menos um bloqueia novo ou um NÃO RESOLVIDO/);
    expect(REVIEW_NOTE).toMatch(/NÃO COMPROVADO, ao menos um item não checado/);
    expect(REVIEW_NOTE).toMatch(/Sem isso, o board não fecha a sub-tarefa e diz o que falta/);
  });

  it('o agente revisor-de-codigo fecha com move_card e segue a nota, sem repetir o formato', () => {
    const agente = AGENT_SEEDS.find((a) => a.name === 'revisor-de-codigo')!.body;
    expect(agente).toMatch(
      /Feche a sub-tarefa com move_card: o relatório vai no `comment`, no formato da nota de revisão do get_card, com o VEREDITO na última linha/,
    );
    expect(agente).not.toContain('VEREDITO: APROVADO');
  });
});

describe('nota de revisão no get_card', () => {
  /** Monta uma história com uma sub-tarefa na Fase e com o agente dados, e o estado à mão para o perfil de CLI. */
  async function subtarefa(fase: string, agente: string) {
    const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
    const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'P',
      author: 'Pessoa',
      attachmentsDir: '/tmp',
      workspaceDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-ws-')),
      homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-home-')),
    });
    const s0 = router.snapshot();
    const parentWorkflow = s0.workflows.find((w) => w.kind === 'parent')!;
    const childWorkflow = s0.workflows.find((w) => w.kind === 'child')!;
    const storyType = s0.cardTypes.find((t) => t.defaultWorkflowId === parentWorkflow.id)!;
    const subType = s0.cardTypes.find((t) => t.defaultWorkflowId === childWorkflow.id)!;
    const storyColumn = s0.columns.find((c) => c.workflowId === parentWorkflow.id)!;
    const subColumn = s0.columns.find((c) => c.workflowId === childWorkflow.id)!;
    const storyId = router.createCard({ typeId: storyType.id, columnId: storyColumn.id, parentId: null, title: 'história' });
    const subId = router.createCard({ typeId: subType.id, columnId: subColumn.id, parentId: storyId, title: 'sub-tarefa' });
    const faseField = router.snapshot().fieldDefs.find((f) => f.name === 'Fase')!;
    // a Fase é do board e da IA (o get_card dela): a gravação entra como origem da IA
    router.handle({ type: 'field.setValue', cardId: subId, fieldId: faseField.id, value: fase }, { author: 'IA', source: 'ai' });
    const s1 = router.snapshot();
    const s: BoardState = {
      ...s1,
      board: { ...s1.board, execProfiles: [...s1.board.execProfiles, { id: 'perfil-agente', name: agente } as never] },
      cards: s1.cards.map((c) => (c.id === subId ? { ...c, execProfile: 'perfil-agente' } : c)),
    };
    return { s, card: s.cards.find((c) => c.id === subId)! };
  }
  const reviewNoteOf = (s: BoardState, c: BoardState['cards'][number]) =>
    (cardDetail(s, c, () => '') as { reviewNote?: string }).reviewNote;

  it('a sub-tarefa de Revisão do revisor-de-codigo traz a nota com o formato do veredito', async () => {
    const { s, card } = await subtarefa('Revisão', 'revisor-de-codigo');
    expect(reviewNoteOf(s, card)).toBe(REVIEW_NOTE);
  });

  it('fora da Revisão, ou com outro agente, o get_card não traz a nota', async () => {
    const implementacao = await subtarefa('Implementação', 'revisor-de-codigo');
    expect(reviewNoteOf(implementacao.s, implementacao.card)).toBeUndefined();
    const outroAgente = await subtarefa('Revisão', 'revisor-de-spec');
    expect(reviewNoteOf(outroAgente.s, outroAgente.card)).toBeUndefined();
  });
});
