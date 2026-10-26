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
    expect(item.path).toContain('/faz-ai-library/library-test/skills/react/SKILL.md');
    expect(fs.readFileSync(path.join(path.dirname(item.path), 'references/forms.md'), 'utf8')).toBe('Referência');
    router.handle({
      type: 'harness.artifact.save',
      kind: 'skill',
      name: 'react',
      previous: 'react',
      body: '---\nname: react\ndescription: Particular\n---\nCópia editada',
    });
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
    const pending = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    expect(router.libraryMcpDefinitions()).toEqual({});
    router.handle({
      type: 'harness.library.save',
      input: { ...router.readLibraryArtifact(pending.id), server: { command: 'memoria', env: { TOKEN: 'segredo-particular' } } },
    });
    fs.rmSync(path.join(root, 'project/.claude'), { recursive: true });
    fs.rmSync(path.join(root, 'project/.mcp.json'));
    router.refreshHarness();
    let s = router.snapshot();
    expect(JSON.stringify(s)).not.toContain('segredo-particular');
    const board = { command: 'node', args: ['bridge.js'] };
    const plan = executionPlan(s, card('c'), router.libraryMcpDefinitions(), board);
    expect(JSON.parse(plan.input.mcpConfig!).mcpServers.memoria.env.TOKEN).toBe('segredo-particular');
    expect(plan.input.agentDefinition?.prompt).toBe('Revise com rigor.');
    expect(JSON.parse(bareExec(null, board, s, router.libraryMcpDefinitions()).mcpConfig!).mcpServers.memoria).toBeDefined();
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'kimi' } });
    s = router.snapshot();
    expect(s.board.execProfiles[0]!.instructions).toBe('Revise com rigor.');
    // o agente da execução é a cópia do board, não o arquivo da ferramenta (que já foi apagado)
    expect(s.board.execProfiles[0]!.scope).toBe('board');
    expect(harnessOverview(s).agents[0]!.name).toBe('revisor');
    const cardId = router.createCard({ typeId: s.cardTypes[0]!.id, columnId: s.columns[0]!.id, parentId: null, title: 'Revisar' });
    router.handle({ type: 'card.execProfile.set', cardId, profileId: 'revisor' });
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'agent', location: '.claude/agents/revisor.md' }], usage: null });
    expect(router.snapshot().cards.find((c) => c.id === cardId)!.execProfile).toBeNull();
  });

  it('agentes criados e editados pelo board ficam no banco: nada é gravado na pasta da ferramenta, nem na origem copiada', () => {
    const origin = write('project/.claude/agents/copiado.md', '---\nname: copiado\ndescription: Original\n---\nCorpo original.');
    router.refreshHarness();
    select('agent', '.claude/agents/copiado.md');
    router.handle({
      type: 'harness.agent.create',
      scope: 'user',
      input: { name: 'novo', description: 'Novo', body: 'Faça.', model: '', tools: ['Read'], deniedTools: [], skills: [], mcp: [] },
    });
    expect(fs.existsSync(path.join(root, 'home/.claude/agents'))).toBe(false);
    const agent = (name: string) => router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'agent' && a.name === name)!;
    expect(agent('novo')).toMatchObject({ usage: 'contextual', origin: '', body: 'Faça.' });

    router.handle({
      type: 'harness.agent.update',
      name: 'copiado',
      scope: 'project',
      patch: { description: 'Editado' },
      body: 'Corpo novo.',
    });
    expect(agent('copiado')).toMatchObject({ description: 'Editado', body: 'Corpo novo.' });
    expect(fs.readFileSync(origin, 'utf8')).toContain('Corpo original.');
    expect(router.snapshot().board.execProfiles.find((p) => p.id === 'copiado')!.instructions).toBe('Corpo novo.');

    router.handle({
      type: 'harness.agent.write',
      name: 'novo',
      scope: 'user',
      content: '---\nname: novo\ndescription: Pelo editor\ntools: Read, Grep\n---\nInstruções do editor.',
    });
    expect(agent('novo')).toMatchObject({ description: 'Pelo editor', body: 'Instruções do editor.' });
    expect(agent('novo').agent!.tools.native.allow).toEqual(['Read', 'Grep']);

    router.handle({ type: 'harness.agent.delete', name: 'copiado', scope: 'project' });
    expect(router.snapshot().harness.library!.artifacts.some((a) => a.name === 'copiado')).toBe(false);
    expect(fs.existsSync(origin)).toBe(true);
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

  it('a cópia guarda a origem: ao reabrir, a linha diz se a origem mudou, se sumiu ou se a cópia foi editada no board', () => {
    const source = write('project/.claude/skills/react/SKILL.md', '---\nname: react\ndescription: Componentes\n---\nPrimeira');
    router.refreshHarness();
    select('skill', '.claude/skills/react/SKILL.md');
    const row = () => router.snapshot().harness.library!.artifacts.find((a) => a.name === 'react')!;
    router.refreshHarness();
    expect(row()).not.toHaveProperty('originState');
    expect(row()).not.toHaveProperty('editedInBoard');

    // editar no board marca a cópia na hora, sem reler a origem
    router.handle({
      type: 'harness.artifact.save',
      kind: 'skill',
      name: 'react',
      previous: 'react',
      body: '---\nname: react\ndescription: Componentes\n---\nEditada no board',
    });
    expect(row().editedInBoard).toBe(true);
    expect(row()).not.toHaveProperty('originState');

    // a origem só é relida ao reabrir os artefatos
    fs.writeFileSync(source, '---\nname: react\ndescription: Componentes\n---\nSegunda');
    expect(row()).not.toHaveProperty('originState');
    router.refreshHarness();
    expect(row()).toMatchObject({ originState: 'changed', editedInBoard: true });

    // atualizar da origem traz a segunda versão e a cópia volta a conferir
    router.handle({ type: 'harness.library.update', id: row().id });
    expect(row()).not.toHaveProperty('originState');
    expect(row()).not.toHaveProperty('editedInBoard');
    expect(fs.readFileSync(row().path, 'utf8')).toContain('Segunda');

    fs.rmSync(source);
    router.refreshHarness();
    expect(row().originState).toBe('missing');
  });

  it('a cópia anterior a esta versão, sem resumo da origem, ganha o resumo quando confere e mostra a diferença quando não confere', () => {
    write('project/.claude/skills/igual/SKILL.md', '---\nname: igual\ndescription: A\n---\nIgual');
    const diferente = write('project/.claude/skills/outra/SKILL.md', '---\nname: outra\ndescription: B\n---\nAntes');
    router.refreshHarness();
    select('skill', '.claude/skills/igual/SKILL.md');
    select('skill', '.claude/skills/outra/SKILL.md');
    handle.db.run("UPDATE board_artifacts SET origin_digest = ''");
    fs.writeFileSync(diferente, '---\nname: outra\ndescription: B\n---\nDepois');
    router.refreshHarness();
    const s = router.snapshot().harness.library!.artifacts;
    expect(s.find((a) => a.name === 'igual')).not.toHaveProperty('originState');
    expect(s.find((a) => a.name === 'outra')?.originState).toBe('changed');
    const digests = handle.db.exec(
      "SELECT name, origin_digest <> '' FROM board_artifacts WHERE name IN ('igual','outra') ORDER BY name",
    )[0]!;
    expect(digests.values).toEqual([
      ['igual', 1],
      ['outra', 0],
    ]);
  });

  it('as skills do fluxo não entram sozinhas na biblioteca, mas a lista as mostra e o texto vem da extensão; a cópia antiga acompanha a versão', () => {
    const lib = () => router.snapshot().harness.library!;
    expect(lib().artifacts.some((a) => a.kind === 'skill')).toBe(false);
    expect(lib().flowSkills!.map((f) => f.name)).toEqual([
      'faz-ai-fluxo',
      'faz-ai-harness-do-card',
      'faz-ai-workspace-e-pr',
      'faz-ai-implementacao-rodadas',
      'faz-ai-revisao-e-homologacao',
      'faz-ai-modo-autonomo',
    ]);
    expect(router.readArtifact('skill', 'faz-ai-modo-autonomo').text).toContain('# Modo autônomo');

    // a cópia que uma versão anterior pôs na biblioteca, com texto antigo, volta ao texto desta versão
    new ArtifactRepo(handle.db).upsert(
      router.snapshot().board.id,
      {
        kind: 'skill',
        name: 'faz-ai-fluxo',
        description: 'antiga',
        body: 'texto antigo',
        meta: { generated: true },
        origin: '',
        originTool: '',
        missing: false,
        skipped: [],
        files: [],
      },
      'always',
    );
    router.refreshHarness();
    const main = lib().artifacts.find((a) => a.name === 'faz-ai-fluxo')!;
    expect(main).toMatchObject({ generated: true, usage: 'always' });
    expect(fs.readFileSync(main.path, 'utf8')).toContain('release_card');
    expect(router.readArtifact('skill', 'faz-ai-fluxo').text).toContain('release_card');
    expect(() =>
      router.handle({ type: 'harness.selection.set', items: [{ kind: 'skill', location: 'board:faz-ai-fluxo' }], usage: null }),
    ).toThrow('skill do fluxo');
  });

  it('"Importar → Ferramenta instalada" liga só a ferramenta que tem o que importar no projeto ou no usuário', () => {
    const installed = () => Object.fromEntries(router.snapshot().harness.inventory.map((i) => [i.tool, i.installed]));
    expect(installed()).toEqual({ claude: false, cursor: false, kimi: false });
    write('project/CLAUDE.md', '# Convenções');
    write('home/.cursor/mcp.json', JSON.stringify({ mcpServers: { github: { command: 'gh' } } }));
    router.refreshHarness();
    expect(installed()).toEqual({ claude: true, cursor: true, kimi: false });
    // o board só confere se há algo: os itens não são varridos para o estado
    expect(router.snapshot().harness.inventory.every((i) => i.items.length === 0)).toBe(true);
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

describe('gerenciamento centralizado dos artefatos', () => {
  it('importa uma coleção mista para as quatro abas e não sobrescreve nomes de outra origem', () => {
    write('collection/rules/AGENTS.md', 'Use os testes do projeto.');
    write('collection/skills/react/SKILL.md', '---\nname: react\ndescription: Componentes\n---\nSiga os contratos.');
    write('collection/skills/react/references/api.md', 'Contrato de API');
    write('collection/agents/revisor.md', '---\nname: revisor\ndescription: Revisa alterações\n---\nLeia o diff.');
    write(
      'collection/mcp.json',
      JSON.stringify({ mcpServers: { memoria: { command: 'npx', args: ['memoria'], env: { TOKEN: 'privado' } } } }),
    );
    router.handle({ type: 'harness.library.scan', dir: path.join(root, 'collection') });
    const preview = router.snapshot().harness.library!.preview!;
    expect(preview.items.map((i) => i.kind).sort()).toEqual(['agent', 'mcp', 'rule', 'skill']);
    expect(JSON.stringify(preview)).not.toContain('privado');
    router.handle({ type: 'harness.library.apply', keys: preview.items.map((i) => i.key) });
    const library = router.snapshot().harness.library!;
    expect(library.artifacts).toHaveLength(4);
    expect(library.artifacts.find((a) => a.kind === 'rule')).toMatchObject({ name: 'AGENTS.md', usage: 'off' });
    expect(library.artifacts.find((a) => a.kind === 'skill')!.files).toEqual(['references/api.md']);
    expect(JSON.stringify(router.snapshot())).not.toContain('privado');
    expect(library.preview).toBeUndefined();
    write('other/skills/react/SKILL.md', 'Outra skill');
    router.handle({ type: 'harness.library.scan', dir: path.join(root, 'other') });
    write('other/rules/new.md', 'Nova regra');
    router.handle({ type: 'harness.library.scan', dir: path.join(root, 'other') });
    router.handle({ type: 'harness.library.apply', keys: router.snapshot().harness.library!.preview!.items.map((i) => i.key) });
    const result = router.snapshot().harness.library!.importResult!;
    expect(result).toMatchObject({ imported: 1, skipped: [{ kind: 'skill', name: 'react' }] });
    const oldSkill = router.snapshot().harness.library!.artifacts.find((i) => i.name === 'react')!;
    expect(router.readLibraryArtifact(oldSkill.id).body).toContain('Siga os contratos.');
    router.handle({ type: 'harness.library.apply', keys: result.skipped.map((i) => i.key), overwrite: true });
    expect(router.readLibraryArtifact(oldSkill.id).body).toBe('Outra skill');
    expect(router.snapshot().harness.library!.importResult).toEqual({ imported: 1, skipped: [] });
    expect(router.snapshot().harness.library!.artifacts).toHaveLength(5);
  });

  it('cria e edita no board, preservando anexos, identidade e modo de uso', () => {
    router.handle({
      type: 'harness.library.save',
      input: { kind: 'rule', name: 'AGENTS.md', description: 'Regras gerais', body: 'Use testes.' },
    });
    const rule = router.snapshot().harness.library!.artifacts[0]!;
    expect(rule.usage).toBe('off');
    expect(fs.existsSync(path.join(root, 'project/AGENTS.md'))).toBe(false);
    router.handle({ type: 'harness.library.save', input: { ...router.readLibraryArtifact(rule.id), body: 'Use testes e lint.' } });
    expect(fs.readFileSync(rule.path, 'utf8')).toBe('Use testes e lint.');
    expect(router.snapshot().harness.library!.artifacts[0]!.id).toBe(rule.id);
    expect(() =>
      router.handle({ type: 'harness.library.save', input: { kind: 'rule', name: 'AGENTS.md', description: '', body: 'Acidental' } }),
    ).toThrow('Já existe');
    router = makeRouter();
    expect(router.readLibraryArtifact(rule.id).body).toBe('Use testes e lint.');
  });

  it('agentes neutros traduzem as categorias em ferramentas de cada executor', () => {
    router.handle({
      type: 'harness.library.save',
      input: {
        kind: 'agent',
        name: 'revisor-neutro',
        description: 'Só leitura',
        body: 'Revise o projeto.',
        agent: { skills: [], mcpServers: [], model: '', tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } } },
      },
    });
    for (const aiTool of ['claude', 'cursor', 'kimi'] as const) {
      router.handle({ type: 'settings.board.update', patch: { aiTool } });
      const profile = router.snapshot().board.execProfiles.find((a) => a.name === 'revisor-neutro')!;
      if (aiTool !== 'claude') expect(profile.instructions).toContain('read');
      else expect(profile.tools.length).toBeGreaterThan(0);
    }
  });

  it('a importação recusa links simbólicos e não confunde arquivos de apoio com regras', () => {
    write('collection/skills/react/SKILL.md', 'Use React');
    write('collection/skills/react/references/rules/AGENTS.md', 'Apoio, não regra');
    const outside = write('outside/agent.md', 'Externo');
    fs.mkdirSync(path.join(root, 'collection/agents'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'collection/agents/externo.md'));
    router.handle({ type: 'harness.library.scan', dir: path.join(root, 'collection') });
    expect(router.snapshot().harness.library!.preview!.items.map((a) => a.kind)).toEqual(['skill']);
  });
});

it('editar a descrição da skill atualiza o YAML e preserva opções e arquivos de apoio', () => {
  write(
    'project/.claude/skills/revisar/SKILL.md',
    '---\nname: revisar\ndescription: |\n  Antiga descrição\n  em bloco\ndisable-model-invocation: true\n---\nInstruções particulares.',
  );
  write('project/.claude/skills/revisar/references/contrato.md', 'Contrato');
  router.refreshHarness();
  select('skill', '.claude/skills/revisar/SKILL.md');
  const skill = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'skill')!;
  router.handle({ type: 'harness.library.save', input: { ...router.readLibraryArtifact(skill.id), description: 'Nova descrição' } });
  router.refreshHarness();
  expect(fs.readFileSync(skill.path, 'utf8')).toContain('description: "Nova descrição"');
  expect(fs.readFileSync(skill.path, 'utf8')).toContain('disable-model-invocation: true');
  expect(fs.readFileSync(skill.path, 'utf8')).toContain('Instruções particulares.');
  expect(fs.readFileSync(path.join(path.dirname(skill.path), 'references/contrato.md'), 'utf8')).toBe('Contrato');
});

it('preserva também artefatos de mesma origem e exige uma nova confirmação para sobrescrever', () => {
  write('source/rules/base.md', 'Versão original');
  const source = path.join(root, 'source');
  router.handle({ type: 'harness.library.scan', dir: source });
  router.handle({ type: 'harness.library.apply', keys: router.snapshot().harness.library!.preview!.items.map((i) => i.key) });
  const artifact = router.snapshot().harness.library!.artifacts[0]!;
  router.handle({ type: 'harness.library.save', input: { ...router.readLibraryArtifact(artifact.id), body: 'Versão personalizada' } });
  write('source/rules/base.md', 'Versão atualizada');
  router.handle({ type: 'harness.library.scan', dir: source });
  const keys = router.snapshot().harness.library!.preview!.items.map((i) => i.key);
  expect(() => router.handle({ type: 'harness.library.apply', keys, overwrite: true })).toThrow('Releia');
  router.handle({ type: 'harness.library.apply', keys });
  expect(router.readLibraryArtifact(artifact.id).body).toBe('Versão personalizada');
  expect(router.snapshot().harness.library!.importResult).toMatchObject({ imported: 0, skipped: [{ name: 'base.md' }] });
  router.handle({ type: 'harness.library.apply', keys, overwrite: true });
  expect(router.readLibraryArtifact(artifact.id).body).toBe('Versão atualizada');
  expect(router.snapshot().harness.library!.preview).toBeUndefined();
});

it('consulta o conteúdo dos artefatos do projeto para gerar sugestões sem expor definições MCP', () => {
  write('project/AGENTS.md', 'Regras da raiz');
  write('project/.claude/skills/task/SKILL.md', '---\nname: task\ndescription: Uma tarefa\n---\nProcedimento');
  write('project/.claude/agents/reviewer.md', '---\nname: reviewer\ndescription: Revisão\n---\nEntregue evidências');
  write('project/.mcp.json', JSON.stringify({ mcpServers: { service: { command: 'node', env: { SECRET: 'private-value' } } } }));
  const evidence = router.projectArtifacts();
  expect(evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'rule', body: 'Regras da raiz' }),
      expect.objectContaining({ kind: 'skill', name: 'task' }),
      expect.objectContaining({ kind: 'agent', name: 'reviewer' }),
    ]),
  );
  expect(JSON.stringify(evidence)).not.toContain('private-value');
  expect(evidence.some((a) => a.kind === 'mcp')).toBe(false);
});
