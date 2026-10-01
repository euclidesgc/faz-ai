import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { Board } from '../src/webview/components/Board';
import { CommentsTab } from '../src/webview/components/CommentsTab';
import { CardDrawer } from '../src/webview/components/CardDrawer';
import { FilterBar } from '../src/webview/components/FilterBar';
import { TrashView } from '../src/webview/components/TrashView';
import { ColumnsSettings } from '../src/webview/components/settings/ColumnsSettings';
import { FieldsSettings } from '../src/webview/components/settings/FieldsSettings';
import { HarnessSettings } from '../src/webview/components/settings/HarnessSettings';
import { RuleBuilder } from '../src/webview/components/settings/ModelRulesEditor';
import { AppearanceSettings } from '../src/webview/components/settings/AppearanceSettings';
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
  router.handle({ type: 'field.setValue', cardId: storyId, fieldId: field('Esforço da atividade').id, value: 'Baixo' });
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
    expect(board).toContain('suggest-model');
    // a coluna de arquivados está sempre no board, colapsada por padrão; as demais abertas
    expect(board.match(/column collapsed archive/g)).toHaveLength(2);
    expect(board).not.toContain('Arraste um card para cá para arquivar');
    const s = useBoardStore.getState().state!;
    const prd = s.columns.find((c) => c.name === 'PRD')!;
    const child = s.workflows.find((w) => w.kind === 'child')!;
    useBoardStore.setState({ collapsed: { [prd.id]: true, [`archive:${s.workflows[0]!.id}`]: false, [child.id]: true } });
    const custom = html(<Board />);
    expect(custom).toContain('Expandir &quot;PRD&quot;');
    expect(custom).toContain('Arraste um card para cá para arquivar'); // arquivados da linha de cima aberto
    expect(custom).toContain('workflow workflow-child collapsed');
    expect(custom).not.toContain('A fazer'); // linha de baixo fechada não mostra as colunas
    useBoardStore.setState({ collapsed: {} }); // a história tem modelo manual diferente da sugestão
    expect(html(<FilterBar />)).toContain('Filtros');
    expect(html(<FiltersApp />).length).toBeGreaterThan(100);
    expect(html(<TrashView />)).toContain('Lixo');
    const drawer = html(<CardDrawer cardId={storyId} />);
    expect(drawer).toContain('História');
    // arquivar e excluir não ficam soltos ao lado do fechar: estão dentro do menu de ações
    expect(drawer).toContain('Ações ▾');
    expect(drawer).not.toContain('🗑 Excluir');
    expect(drawer.indexOf('Ações ▾')).toBeLessThan(drawer.indexOf('drawer-divider'));
    expect(drawer.indexOf('drawer-divider')).toBeLessThan(drawer.indexOf('drawer-close'));
    // comentário de outro autor (ex.: a IA): pode ser apagado, mas não editado
    const st = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...st, comments: st.comments.map((c) => ({ ...c, author: 'Claude Code' })) } });
    const foreign = html(<CommentsTab cardId={storyId} />);
    expect(foreign).toContain('Apagar');
    expect(foreign).not.toContain('Editar');
    useBoardStore.setState({ state: st });
    const own = html(<CommentsTab cardId={storyId} />);
    expect(own).toContain('Apagar');
    expect(own).toContain('Editar');
    expect(drawer).toContain('Sugerido pelas regras');
    // esforço da atividade antes do modelo, e o esforço do modelo numa linha própria
    expect(drawer.indexOf('Esforço da atividade')).toBeLessThan(drawer.indexOf('>Modelo<'));
    expect(drawer.indexOf('>Modelo<')).toBeLessThan(drawer.indexOf('Esforço do modelo'));
    expect(drawer).toContain('Claude Code · Haiku 4.5');
  });

  it('configurações', () => {
    expect(html(<Settings />)).toContain('Harness de IA');
    const cols = html(<ColumnsSettings />);
    for (const text of ['PRD', 'Começa colapsada', 'Linha começa colapsada', 'Arquivados']) expect(cols).toContain(text);
    const types = html(<TypesSettings />);
    expect(types).toContain('Padrões por tipo');
    expect(types).toContain('Modelo');
    expect(html(<FieldsSettings />)).toContain('Skills');
    const rules = html(<RulesSettings />);
    expect(rules).toContain('Avançar de fase');
    expect(rules).toContain('Preencher o modelo sugerido');
    const models = html(<ModelsSettings />);
    expect(models).not.toContain('gpt-6.1-sol'); // só a ferramenta em uso
    for (const text of ['Detectar modelos', 'Fable 5.1', 'Sugestão de modelo', 'Esforço da atividade = Baixo', 'Montar nova regra', 'xhigh']) expect(models).toContain(text);
    const s = useBoardStore.getState().state!;
    const tags = s.fieldDefs.find((f) => f.name === 'Tags')!.id;
    const builder = html(
      <RuleBuilder
        initial={{ id: 'r', name: 'Teste', enabled: true, model: 'claude:opus@high', groups: [[{ fieldId: tags, op: 'is', value: 'backend' }, { fieldId: '@type', op: 'isNot', value: 'Bug' }], [{ fieldId: tags, op: 'is', value: 'docs' }]] }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    for (const text of ['Tipo do card', 'OU', 'Adicionar à lista', 'Tags = backend E Tipo ≠ Bug OU Tags = docs']) expect(builder).toContain(text);

    const look = html(<AppearanceSettings />);
    for (const text of ['Tema', 'Sistema (acompanha o VS Code)', 'Fonte dos textos', 'Sem serifa do sistema', '14px', 'Prévia']) expect(look).toContain(text);
    const harness = html(<HarnessSettings />);
    for (const text of ['Ferramenta deste projeto', 'type="radio"', 'Claude Code', 'Codex', 'Cursor', 'Kimi Code', 'AGENTS.md', 'Usar o AGENTS.md', 'revisar-spec', 'Desligada', '.kimi/skills', 'ao board (MCP)']) expect(harness).toContain(text);
  });
});
