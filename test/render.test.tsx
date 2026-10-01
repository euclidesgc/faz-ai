import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { Board } from '../src/webview/components/Board';
import { CardDrawer } from '../src/webview/components/CardDrawer';
import { FilterBar } from '../src/webview/components/FilterBar';
import { TrashView } from '../src/webview/components/TrashView';
import { ColumnsSettings } from '../src/webview/components/settings/ColumnsSettings';
import { FieldsSettings } from '../src/webview/components/settings/FieldsSettings';
import { HarnessSettings } from '../src/webview/components/settings/HarnessSettings';
import { ModelsSettings } from '../src/webview/components/settings/ModelsSettings';
import { RulesSettings } from '../src/webview/components/settings/RulesSettings';
import { Settings } from '../src/webview/components/settings/Settings';
import { TypesSettings } from '../src/webview/components/settings/TypesSettings';
import { FiltersApp } from '../src/webview/FiltersApp';
import { useBoardStore } from '../src/webview/store/boardStore';

// na renderização de servidor o zustand lê o estado inicial da store; aqui as telas precisam do estado atual
vi.mock('zustand', async (original) => {
  const z = await original<typeof import('zustand')>();
  const create = (init: Parameters<typeof z.createStore>[0]) => {
    const api = z.createStore(init) as ReturnType<typeof z.createStore> & { getServerState?: () => unknown };
    api.getServerState = api.getState;
    return z.create(api as never);
  };
  return { ...z, create };
});

/**
 * Renderiza cada tela com um board real (vindo do roteador) para pegar erros de execução nos
 * componentes. Não substitui olhar a tela: só garante que nada quebra ao montar.
 */
let storyId: string;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-render-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws', folderName: 'Projeto', author: 'Pessoa', attachmentsDir: path.join(dir, 'attachments'), workspaceDir: dir,
  });
  let s = router.snapshot();
  const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
  const childWf = s.workflows.find((w) => w.kind === 'child')!;
  const typeOf = (wf: string) => s.cardTypes.find((t) => t.defaultWorkflowId === wf)!;
  const firstCol = (wf: string) => s.columns.find((c) => c.workflowId === wf)!;
  storyId = router.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'História' });
  const sub = router.createCard({ typeId: typeOf(childWf.id).id, columnId: firstCol(childWf.id).id, parentId: storyId, title: 'Tarefa' });
  router.handle({ type: 'harness.rule.write', name: 'AGENTS.md', content: '# Regras' });
  router.handle({ type: 'harness.skill.create', name: 'revisar-spec', description: 'Quando revisar', content: 'Passos' });
  router.handle({ type: 'harness.skill.create', name: 'desligada', description: 'x', content: 'y' });
  router.handle({ type: 'harness.skill.setEnabled', name: 'desligada', enabled: false });
  s = router.snapshot();
  const field = (n: string) => s.fieldDefs.find((f) => f.name === n)!;
  router.handle({ type: 'field.setValue', cardId: sub, fieldId: field('Skills').id, value: ['revisar-spec'] });
  router.handle({ type: 'field.setValue', cardId: sub, fieldId: field('Modelo').id, value: 'claude:opus@high' });
  router.handle({ type: 'field.setValue', cardId: storyId, fieldId: field('Esforço').id, value: 'Baixo' });
  router.handle({ type: 'field.setValue', cardId: storyId, fieldId: field('Modelo').id, value: 'kimi:kimi-code/k3@max' });
  router.handle({ type: 'settings.type.update', typeId: typeOf(childWf.id).id, patch: { defaults: { [field('Modelo').id]: 'claude:sonnet@medium' } } });
  router.handle({ type: 'checklist.add', cardId: storyId, text: 'item' });
  router.handle({ type: 'comment.add', cardId: storyId, body: 'oi' });
  router.handle({ type: 'attachment.addData', cardId: storyId, filename: 'spec.md', base64: Buffer.from('x').toString('base64') });
  const trashed = router.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'Lixo' });
  router.handle({ type: 'card.trash', cardId: trashed });
  useBoardStore.setState({ state: router.snapshot() });
});

const html = (el: ReactElement) => renderToString(el);

describe('telas montam sem erro', () => {
  it('board, filtros, lixeira e detalhe do card', () => {
    const board = html(<Board />);
    expect(board).toContain('Implementação');
    expect(board).toContain('#1');
    expect(board).toContain('revisar-spec');
    expect(board).toContain('Opus 5.5 · high');
    expect(html(<FilterBar />)).toContain('Filtros');
    expect(html(<FiltersApp />).length).toBeGreaterThan(100);
    expect(html(<TrashView />)).toContain('Lixo');
    const drawer = html(<CardDrawer cardId={storyId} />);
    expect(drawer).toContain('História');
    expect(drawer).toContain('Sugerido pelas regras');
    expect(drawer).toContain('Claude Code · Haiku 4.5');
  });

  it('configurações', () => {
    expect(html(<Settings />)).toContain('Harness de IA');
    expect(html(<ColumnsSettings />)).toContain('PRD');
    const types = html(<TypesSettings />);
    expect(types).toContain('Padrões por tipo');
    expect(types).toContain('Modelo');
    expect(html(<FieldsSettings />)).toContain('Skills');
    expect(html(<RulesSettings />)).toContain('Avançar de fase');
    const models = html(<ModelsSettings />);
    for (const text of ['Detectar modelos', 'Fable 5.1', 'gpt-6.1-sol', 'Sugestão de modelo', 'Esforço', 'xhigh']) expect(models).toContain(text);
    const harness = html(<HarnessSettings />);
    for (const text of ['Claude Code', 'Codex', 'Cursor', 'Kimi Code', 'AGENTS.md', 'Usar o AGENTS.md', 'revisar-spec', 'Desligada', '.agents/skills']) expect(harness).toContain(text);
  });
});
