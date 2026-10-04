import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { StateCreator } from 'zustand';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AttachmentsTab } from '../src/webview/components/card/AttachmentsTab';
import { Board } from '../src/webview/components/Board';
import { CommentsTab } from '../src/webview/components/card/CommentsTab';
import { CardDrawer } from '../src/webview/components/CardDrawer';
import { FilterBar } from '../src/webview/components/FilterBar';
import { Theme } from '@radix-ui/themes';
import { ThemeToggle, nextTheme } from '../src/webview/components/ThemeToggle';
import { TrashView } from '../src/webview/components/TrashView';
import { WorkflowsSettings } from '../src/webview/components/settings/workflows/WorkflowsSettings';
import { FieldsSettings } from '../src/webview/components/settings/FieldsSettings';
import { AgentsSettings } from '../src/webview/components/settings/AgentsSettings';
import { HarnessSettings } from '../src/webview/components/settings/HarnessSettings';
import { RuleBuilder } from '../src/webview/components/settings/ModelRulesEditor';
import { AppearanceSettings } from '../src/webview/components/settings/AppearanceSettings';
import { ModelsSettings } from '../src/webview/components/settings/ModelsSettings';
import { RulesSettings } from '../src/webview/components/settings/RulesSettings';
import { Settings } from '../src/webview/components/settings/Settings';
import { GitSettings } from '../src/webview/components/settings/GitSettings';
import { BackupSettings } from '../src/webview/components/settings/BackupSettings';
import { TypesSettings } from '../src/webview/components/settings/TypesSettings';
import { FiltersApp } from '../src/webview/FiltersApp';
import { useBoardStore } from '../src/webview/store/boardStore';

// na renderização de servidor o zustand lê o estado inicial da store; aqui as telas precisam do estado atual
vi.mock('zustand', async (original) => {
  const z = await original<typeof import('zustand')>();
  const create = <T,>(init: StateCreator<T>) =>
    z.create<T>((set, get, api) => {
      Object.assign(api, { getServerState: api.getState });
      return init(set, get, api);
    });
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
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
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
  router.handle({ type: 'harness.agent.create', name: 'revisor-de-spec', description: 'Revisa a spec', content: 'Passos', model: 'opus' });
  s = router.snapshot();
  const field = (n: string) => s.fieldDefs.find((f) => f.name === n)!;
  router.handle({ type: 'field.setValue', cardId: sub, fieldId: field('Skills').id, value: ['revisar-spec'] });
  router.handle({ type: 'field.setValue', cardId: sub, fieldId: field('Modelo').id, value: 'claude:opus@high' });
  router.handle({ type: 'field.setValue', cardId: storyId, fieldId: field('Esforço da atividade').id, value: 'Baixo' });
  router.handle({ type: 'field.setValue', cardId: storyId, fieldId: field('Modelo').id, value: 'kimi:kimi-code/k3@max' });
  router.handle({
    type: 'settings.type.update',
    typeId: typeOf(childWf.id).id,
    patch: { defaults: { [field('Modelo').id]: 'claude:sonnet@medium' } },
  });
  router.handle({ type: 'checklist.add', cardId: storyId, text: 'item' });
  router.handle({ type: 'comment.add', cardId: storyId, body: 'oi' });
  router.handle({ type: 'attachment.addData', cardId: storyId, filename: 'spec.md', base64: Buffer.from('x').toString('base64') });
  const trashed = router.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'Lixo' });
  router.handle({ type: 'card.trash', cardId: trashed });
  useBoardStore.setState({ state: router.snapshot() });
});

// as telas com controles do Radix precisam do `Theme`, como no main.tsx
const html = (el: ReactElement) => renderToString(<Theme>{el}</Theme>);

describe('telas montam sem erro', () => {
  it('board, filtros, lixeira e detalhe do card', () => {
    const board = html(<Board />);
    expect(board).toContain('Implementação');
    expect(board).toContain('#1');
    expect(board).toContain('revisar-spec');
    expect(board).toContain('Opus 5.5 - alto');
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
    expect(html(<FilterBar />)).toContain('Abrir filtros');
    expect(html(<FiltersApp />)).toContain('aria-label="Com quem está"');
    expect(html(<TrashView />)).toContain('Lixo');
    const drawer = html(<CardDrawer cardId={storyId} />);
    expect(drawer).toContain('História');
    // arquivar e excluir não ficam soltos ao lado do fechar: estão dentro do menu de ações
    expect(drawer).toContain('Ações <svg');
    expect(drawer).not.toContain('🗑 Excluir');
    expect(drawer.indexOf('Ações <svg')).toBeLessThan(drawer.indexOf('drawer-divider'));
    expect(drawer.indexOf('drawer-divider')).toBeLessThan(drawer.indexOf('drawer-close'));
    // comentário de outro autor (ex.: a IA): pode ser apagado, mas não editado
    const st = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...st, comments: st.comments.map((c) => ({ ...c, author: 'Claude Code' })) } });
    const foreign = html(<CommentsTab cardId={storyId} />);
    expect(foreign).toContain('Apagar');
    expect(foreign).not.toContain('Editar');
    useBoardStore.setState({ state: st });
    // card aguardando revisão: selo com quem está a pendência e as ações de revisão
    useBoardStore.setState({
      state: { ...st, cards: st.cards.map((c) => (c.id === storyId ? { ...c, status: 'waiting_review' as const } : c)) },
    });
    const reviewing = html(<CardDrawer cardId={storyId} />);
    for (const text of ['Aguardando revisão', 'com você', 'Aprovar', 'Pedir ajustes', 'Conversa', 'Criar branch da história'])
      expect(reviewing).toContain(text);
    expect(html(<Board />)).toContain('status-badge');
    // o artefato fica na história; a sub-tarefa mostra um link para ele
    useBoardStore.setState({ state: { ...st, attachments: st.attachments.map((a) => ({ ...a, artifact: true })) } });
    const subId = st.cards.find((c) => c.parentId === storyId)!.id;
    const subAttachments = html(<AttachmentsTab cardId={subId} />);
    for (const text of ['Artefatos da história', 'spec.md', 'anexado à história', 'Nenhum anexo.']) expect(subAttachments).toContain(text);
    expect(html(<AttachmentsTab cardId={storyId} />)).toContain('artefato');
    useBoardStore.setState({ state: st });
    // conversa: chamar a IA, IA em execução e imagem colada (referência a um anexo do card)
    const image = st.attachments[0]!;
    useBoardStore.setState({
      attachmentsBaseUri: 'https://anexos',
      state: { ...st, aiRuns: [storyId], comments: st.comments.map((c) => ({ ...c, body: `veja ![tela](attachment:${image.filename})` })) },
    });
    const talking = html(<CommentsTab cardId={storyId} />);
    for (const text of ['Chamar IA', 'está trabalhando neste card', 'Parar', `src="https://anexos/${storyId}/${image.storedName}"`])
      expect(talking).toContain(text);
    useBoardStore.setState({ state: { ...st, aiRunUnsupported: 'Sem suporte' } });
    expect(html(<CommentsTab cardId={storyId} />)).toContain('não está disponível');
    useBoardStore.setState({ state: st, attachmentsBaseUri: '' });
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
    // menu recolhido: só ícones, com o nome da seção no aria-label
    useBoardStore.setState({ settingsNavCollapsed: true });
    const collapsed = html(<Settings />);
    expect(collapsed).toContain('settings-side collapsed');
    expect(collapsed).toContain('aria-label="Harness de IA"');
    useBoardStore.setState({ settingsNavCollapsed: false });
    for (const text of [
      'Cada história ganha uma branch e uma pasta de trabalho própria',
      'Nome da branch',
      'historia/12-login-com-google',
      'Pasta das worktrees',
      'Fazer o merge do PR ao aprovar a homologação',
      'Tipo de merge',
    ])
      expect(html(<GitSettings />)).toContain(text);
    const settingsHtml = html(<Settings />);
    expect(settingsHtml).toContain('Backup');
    const backup = html(<BackupSettings />);
    for (const text of ['Exportar board', 'Importar de um arquivo…', 'guarde-o com cuidado']) expect(backup).toContain(text);
    expect(backup).not.toContain('Espere a execução da IA terminar');
    // com a IA executando um card, importar fica desativado com a dica
    const withRun = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...withRun, aiRuns: [withRun.cards[0]!.id] } });
    const blocked = html(<BackupSettings />);
    expect(blocked).toContain('Espere a execução da IA terminar');
    expect(blocked).toMatch(/<button[^>]*disabled[^>]*>Importar de um arquivo…/);
    useBoardStore.setState({ state: withRun });
    // lendo o arquivo escolhido: os dois botões ficam desativados
    useBoardStore.setState({ backupBusy: 'import' });
    expect(html(<BackupSettings />)).toContain('Lendo o arquivo…');
    useBoardStore.setState({ backupBusy: null });
    const cols = html(<WorkflowsSettings />);
    for (const text of ['PRD', 'Novo workflow', 'Nova coluna', 'IA atua', 'Exige aprovação', 'Fase', 'PRD.md', 'Discovery', 'Homologação'])
      expect(cols).toContain(text);
    // a opção de começar colapsada saiu: vale o estado em que a pessoa deixou o board
    for (const text of ['Começa colapsada', 'começa colapsada', 'linha de cima', 'linha de baixo']) expect(cols).not.toContain(text);
    const types = html(<TypesSettings />);
    expect(types).toContain('Padrões por tipo');
    expect(types).toContain('Modelo');
    expect(html(<FieldsSettings />)).toContain('Skills');
    const rules = html(<RulesSettings />);
    expect(rules).toContain('Avançar de fase');
    expect(rules).toContain('Preencher o modelo sugerido');
    const models = html(<ModelsSettings />);
    expect(models).not.toContain('gpt-6.1-sol'); // só a ferramenta em uso
    for (const text of [
      'Detectar modelos',
      'Fable 5.1',
      'Sugestão de modelo',
      'Esforço da atividade = Baixo',
      'Montar nova regra',
      'xhigh',
    ])
      expect(models).toContain(text);
    const s = useBoardStore.getState().state!;
    const tags = s.fieldDefs.find((f) => f.name === 'Tags')!.id;
    const builder = html(
      <RuleBuilder
        initial={{
          id: 'r',
          name: 'Teste',
          enabled: true,
          model: 'claude:opus@high',
          groups: [
            [
              { fieldId: tags, op: 'is', value: 'backend' },
              { fieldId: '@type', op: 'isNot', value: 'Bug' },
            ],
            [{ fieldId: tags, op: 'is', value: 'docs' }],
          ],
        }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    for (const text of ['OU', 'Adicionar à lista', 'Tags = backend E Tipo ≠ Bug OU Tags = docs']) expect(builder).toContain(text);

    const look = html(<AppearanceSettings />);
    for (const text of ['Tema', 'Fonte dos textos', 'Tamanho da fonte: 14px', 'Prévia', 'Status dos cards', 'Aguardando resposta'])
      expect(look).toContain(text);
    const toggle = html(<ThemeToggle />);
    for (const text of ['Tema: Sistema. Clique para mudar para Claro.', '<svg']) expect(toggle).toContain(text);
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual(['light', 'dark', 'system']);
    const profiles = html(<AgentsSettings />);
    for (const text of ['Agentes', 'aceita por parâmetro', 'imposto', 'orientado', 'Novo agente', 'Agente padrão'])
      expect(profiles).toContain(text);
    // cada aba do Harness é montada por vez: juntamos o texto das três
    const harness = (['tool', 'project', 'all'] as const)
      .map((harnessTab) => {
        useBoardStore.setState({ harnessTab });
        return html(<HarnessSettings />);
      })
      .join('\n');
    for (const text of [
      'Ferramenta deste projeto',
      'type="radio"',
      'Claude Code',
      'Codex',
      'Cursor',
      'Kimi Code',
      'GitHub Copilot',
      'AGENTS.md',
      'Usar o AGENTS.md',
      'revisar-spec',
      'Desligada',
      '.kimi-code/skills',
      'Tudo que cada ferramenta carrega',
      'Servidores MCP',
      'Hooks',
      'deste projeto',
      'não encontrada',
      'ao board (MCP)',
      'Instalar skill do fluxo',
      'Execução pela conversa e heartbeat',
      'A IA lê o projeto e usa as ferramentas do board',
      'Tempo limite por execução',
      'Heartbeat ligado',
      'Chamar a IA agora',
      'Subagentes',
      'Novo subagente',
      'revisor-de-spec',
      '.claude/agents/revisor-de-spec.md',
    ])
      expect(harness).toContain(text);
  });
});
