import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory, type DbHandle } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { selectedItems } from '../src/shared/harnessSelection';
import { harnessOverview, requiredSkills } from '../src/extension/mcp/format';
import { executionPlan, bareExec } from '../src/extension/execution';
import { findSkills } from '../src/extension/skillInstall';
import { skillCatalog } from '../src/shared/skillCatalog';
import { card } from './fakes/board';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let root: string;
let handle: DbHandle;
let router: MessageRouter;
const write = (rel: string, body: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
};
const select = (kind: 'skill' | 'agent' | 'instructions' | 'mcp', location: string) =>
  router.handle({ type: 'harness.selection.set', items: [{ kind, location }], usage: kind === 'agent' ? 'contextual' : 'always' });
const makeRouter = () =>
  new MessageRouter(handle, {
    workspaceKey: 'library-test',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'data/attachments'),
    workspaceDir: path.join(root, 'project'),
    homeDir: path.join(root, 'home'),
  });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-library-'));
  fs.mkdirSync(path.join(root, 'project'));
  const db = await openInMemory(WASM_DIR);
  handle = { db, scheduleSave: () => {}, close: async () => db.close() } as DbHandle;
  router = makeRouter();
});
afterEach(async () => {
  await handle.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('biblioteca particular do board', () => {
  it('copia skill e apoio, preserva edições e usa as cópias com qualquer ferramenta e sem a origem', () => {
    write('project/.claude/skills/react/SKILL.md', '---\nname: react\ndescription: Componentes\n---\nOriginal');
    write('project/.claude/skills/react/references/forms.md', 'Referência');
    router.refreshHarness();
    select('skill', '.claude/skills/react/SKILL.md');
    const item = selectedItems(router.snapshot(), 'skill')[0]!;
    expect(item.path).toContain('/artifacts/library-test/skills/react/SKILL.md');
    expect(fs.readFileSync(path.join(path.dirname(item.path), 'references/forms.md'), 'utf8')).toBe('Referência');
    router.writeHarnessFile(item.path, '---\nname: react\ndescription: Particular\n---\nCópia editada');
    expect(fs.readFileSync(path.join(root, 'project/.claude/skills/react/SKILL.md'), 'utf8')).toContain('Original');
    fs.rmSync(path.join(root, 'project/.claude'), { recursive: true });
    for (const aiTool of ['cursor', 'kimi', 'claude'] as const) {
      router.handle({ type: 'settings.board.update', patch: { aiTool } });
      router.refreshHarness();
      const s = router.snapshot();
      expect(selectedItems(s, 'skill')[0]!.description).toBe('Particular');
      expect(harnessOverview(s).skills[0]!.name).toBe('react');
      expect(skillCatalog(s)[0]).toMatchObject({ name: 'react', description: 'Particular' });
      expect(requiredSkills(s, card('c'))).toEqual([]); // Sempre entra pelo contexto fixo.
    }
    router = makeRouter();
    expect(fs.readFileSync(selectedItems(router.snapshot(), 'skill')[0]!.path, 'utf8')).toContain('Cópia editada');
  });

  it('copia agentes e servidores sem expor credenciais; a execução e o chat usam o MCP copiado', () => {
    write('project/.claude/agents/revisor.md', '---\nname: revisor\ndescription: Revisa\ntools: Read, Grep\n---\nRevise com rigor.');
    write('project/.mcp.json', JSON.stringify({ mcpServers: { memoria: { command: 'memoria', env: { TOKEN: 'segredo-particular' } } } }));
    router.refreshHarness();
    select('agent', '.claude/agents/revisor.md');
    select('mcp', '.mcp.json#memoria');
    fs.rmSync(path.join(root, 'project/.claude'), { recursive: true });
    fs.rmSync(path.join(root, 'project/.mcp.json'));
    router.refreshHarness();
    let s = router.snapshot();
    expect(JSON.stringify(s)).not.toContain('segredo-particular');
    const board = { command: 'node', args: ['bridge.js'] };
    const plan = executionPlan(s, card('c'), path.join(root, 'project'), '', board, router.libraryMcpDefinitions());
    expect(JSON.parse(plan.input.mcpConfig!).mcpServers.memoria.env.TOKEN).toBe('segredo-particular');
    expect(plan.input.agentDefinition?.prompt).toBe('Revise com rigor.');
    expect(
      JSON.parse(bareExec(null, board, s, { projectDir: '', homeDir: '' }, router.libraryMcpDefinitions()).mcpConfig!).mcpServers.memoria,
    ).toBeDefined();
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'kimi' } });
    s = router.snapshot();
    expect(s.board.execProfiles[0]!.instructions).toBe('Revise com rigor.');
    expect(harnessOverview(s).agents[0]!.name).toBe('revisor');
    const cardId = router.createCard({ typeId: s.cardTypes[0]!.id, columnId: s.columns[0]!.id, parentId: null, title: 'Revisar' });
    router.handle({ type: 'card.execProfile.set', cardId, profileId: 'revisor' });
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'agent', location: '.claude/agents/revisor.md' }], usage: null });
    expect(router.snapshot().cards.find((c) => c.id === cardId)!.execProfile).toBeNull();
  });

  it('atualiza só sob pedido e preserva a cópia quando a origem não está disponível', () => {
    const source = write('project/.claude/skills/react/SKILL.md', 'Primeira versão');
    router.refreshHarness();
    select('skill', '.claude/skills/react/SKILL.md');
    const a = router.snapshot().harness.library!.artifacts[0]!;
    fs.writeFileSync(source, 'Segunda versão');
    router.refreshHarness();
    expect(fs.readFileSync(a.path, 'utf8')).toBe('Primeira versão');
    router.handle({ type: 'harness.library.update', id: a.id });
    expect(fs.readFileSync(a.path, 'utf8')).toBe('Segunda versão');
    fs.rmSync(source);
    expect(() => router.handle({ type: 'harness.library.update', id: a.id })).toThrow('cópia do board foi preservada');
    expect(fs.readFileSync(a.path, 'utf8')).toBe('Segunda versão');
  });

  it('importa coleções em lote e impede colisões sem gravar parte do lote', () => {
    write('collection/react/SKILL.md', 'Skill React');
    write('collection/sql/SKILL.md', 'Skill SQL');
    const dir = path.join(root, 'collection');
    router.setInstall(dir, dir, () => {});
    expect(findSkills(dir)).toHaveLength(2);
    router.handle({ type: 'harness.library.import', rels: ['react', 'sql'] });
    expect(selectedItems(router.snapshot(), 'skill').map((i) => i.name)).toEqual(['react', 'sql']);
    write('other/react/SKILL.md', 'Outra React');
    write('other/new/SKILL.md', 'Nova');
    const other = path.join(root, 'other');
    router.setInstall(other, other, () => {});
    expect(() => router.handle({ type: 'harness.library.import', rels: ['new', 'react'] })).toThrow('Já existe um artefato');
    expect(selectedItems(router.snapshot(), 'skill')).toHaveLength(2);
  });

  it('troca a pasta sem apagar arquivos da pessoa e remove somente a cópia ao desmarcar', () => {
    const source = write('project/.claude/skills/react/SKILL.md', 'Particular');
    router.refreshHarness();
    select('skill', '.claude/skills/react/SKILL.md');
    const old = selectedItems(router.snapshot(), 'skill')[0]!.path;
    const occupied = path.join(root, 'occupied');
    write('occupied/arquivo.txt', 'Preservar');
    expect(() => router.handle({ type: 'harness.library.directory', dir: occupied })).toThrow('pasta vazia');
    expect(fs.readFileSync(path.join(occupied, 'arquivo.txt'), 'utf8')).toBe('Preservar');
    const dir = path.join(root, 'nova-biblioteca');
    router.handle({ type: 'harness.library.directory', dir });
    const copy = selectedItems(router.snapshot(), 'skill')[0]!;
    expect(copy.path.startsWith(dir)).toBe(true);
    expect(fs.existsSync(old)).toBe(true);
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'skill', location: copy.location }], usage: null });
    expect(fs.existsSync(copy.path)).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
    expect(new ArtifactRepo(handle.db).list(router.boardId)).toEqual([]);
  });
  it('reconhece pastas coladas, atualiza as opções dos cards e preserva arquivos desconhecidos ao reabrir', () => {
    const library = router.snapshot().harness.library!.directory;
    fs.mkdirSync(path.join(library, 'react/references'), { recursive: true });
    fs.writeFileSync(
      path.join(library, 'react/SKILL.md'),
      '---\nname: react\ndescription: Componentes locais\n---\nLeia references/form.md',
    );
    fs.writeFileSync(path.join(library, 'react/references/form.md'), 'Referência particular');
    fs.writeFileSync(path.join(library, 'rascunho.txt'), 'Não apagar');
    router.refreshHarness();
    const s = router.snapshot();
    expect(selectedItems(s, 'skill').map((i) => i.name)).toEqual(['react']);
    expect(s.fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['react']);
    expect(fs.readFileSync(path.join(library, 'react/SKILL.md'), 'utf8')).toContain('Componentes locais');
    router = makeRouter();
    expect(selectedItems(router.snapshot(), 'skill')[0]!.description).toBe('Componentes locais');
    expect(fs.readFileSync(path.join(library, 'rascunho.txt'), 'utf8')).toBe('Não apagar');
    expect(fs.readFileSync(path.join(library, 'react/references/form.md'), 'utf8')).toBe('Referência particular');
    fs.writeFileSync(path.join(library, 'react/SKILL.md'), '---\nname: react\ndescription: Atualizada na pasta colada\n---\nRevisada');
    router.refreshHarness();
    expect(selectedItems(router.snapshot(), 'skill')[0]!.description).toBe('Atualizada na pasta colada');
  });

  it('preserva edições externas da cópia e atualizações explícitas da origem sem desfazer nenhuma na abertura', () => {
    const source = write('project/.claude/skills/react/SKILL.md', 'Original');
    router.refreshHarness();
    select('skill', '.claude/skills/react/SKILL.md');
    const a = router.snapshot().harness.library!.artifacts[0]!;
    fs.writeFileSync(a.path, 'Editado diretamente na biblioteca');
    router.refreshHarness();
    router = makeRouter();
    expect(router.readHarnessFile(a.path).content).toBe('Editado diretamente na biblioteca');
    fs.writeFileSync(source, 'Atualizado da origem');
    router.handle({ type: 'harness.library.update', id: a.id });
    router = makeRouter();
    expect(router.readHarnessFile(a.path).content).toBe('Atualizado da origem');
  });

  it('não reimporta uma pasta colada depois de remover a cópia e conserva nomes duplicados sem sobrescrever', () => {
    const library = router.snapshot().harness.library!.directory;
    fs.mkdirSync(path.join(library, 'react'), { recursive: true });
    fs.writeFileSync(path.join(library, 'react/SKILL.md'), 'Colada');
    router.refreshHarness();
    const item = selectedItems(router.snapshot(), 'skill')[0]!;
    const duplicate = path.join(library, 'outra/react');
    fs.mkdirSync(duplicate, { recursive: true });
    fs.writeFileSync(path.join(duplicate, 'SKILL.md'), 'Diferente');
    router.refreshHarness();
    expect(router.readHarnessFile(item.path).content).toBe('Colada');
    expect(router.snapshot().harness.library!.warnings).toContainEqual({ path: 'outra/react/SKILL.md', reason: 'duplicate' });
    expect(fs.readFileSync(path.join(duplicate, 'SKILL.md'), 'utf8')).toBe('Diferente');
    fs.rmSync(duplicate, { recursive: true });
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'skill', location: item.location }], usage: null });
    router = makeRouter();
    expect(selectedItems(router.snapshot(), 'skill')).toEqual([]);
    expect(fs.existsSync(path.join(library, 'react/SKILL.md'))).toBe(true);
    fs.writeFileSync(path.join(library, 'react/SKILL.md'), 'Colada');
    router.refreshHarness();
    expect(selectedItems(router.snapshot(), 'skill').map((i) => i.name)).toEqual(['react']);
  });
  it('não substitui o conteúdo colado de uma skill do fluxo pelo conteúdo embutido na extensão', () => {
    const library = router.snapshot().harness.library!.directory;
    const skill = path.join(library, 'skills/faz-ai-fluxo/SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'Meu fluxo particular');
    router.refreshHarness();
    router = makeRouter();
    expect(router.readHarnessFile(skill).content).toBe('Meu fluxo particular');
  });
});
