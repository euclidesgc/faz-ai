import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactImporter } from '../src/extension/artifactImport';
import { exportBoard } from '../src/extension/db/boardExport';
import { openInMemory, type DbHandle } from '../src/extension/db/database';
import { BoardContext } from '../src/extension/panel/handlers/context';
import type { GitRunner } from '../src/extension/skillInstall';
import type { ArtifactDraft } from '../src/shared/artifacts';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let root: string;
let handle: DbHandle;
let ctx: BoardContext;

const write = (rel: string, body: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
};
const skillMd = (name: string, description = 'Faz algo') => `---\nname: ${name}\ndescription: ${description}\n---\nCorpo`;
const agentMd = (name: string) => `---\nname: ${name}\ndescription: Agente ${name}\n---\nInstruções`;
const contextFor = (key: string) =>
  new BoardContext(handle, {
    workspaceKey: key,
    folderName: key,
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'data', key),
    libraryDir: path.join(root, 'library', key),
    workspaceDir: path.join(root, 'project'),
    homeDir: path.join(root, 'home'),
  });
const repo = () => ctx.library.repo;
const draft = (kind: ArtifactDraft['kind'], name: string, extra: Partial<ArtifactDraft> = {}): ArtifactDraft => ({
  kind,
  name,
  description: `d-${name}`,
  body: kind === 'skill' ? skillMd(name) : 'corpo',
  meta: kind === 'mcp' ? { server: { command: 'npx', env: { TOKEN: 'segredo-do-board' } } } : {},
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  ...extra,
});
/** Tudo que há sob uma pasta, com o conteúdo, para provar que nada foi gravado nela. */
const tree = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).map((e) => {
    const file = path.join(e.parentPath, e.name);
    return `${path.relative(dir, file)}:${e.isFile() ? fs.readFileSync(file, 'utf8') : ''}`;
  });
};
const tmpClones = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('fazai-skills-'));

beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-importer-')));
  fs.mkdirSync(path.join(root, 'project'));
  fs.mkdirSync(path.join(root, 'home'));
  const db = await openInMemory(WASM_DIR);
  handle = { db, scheduleSave: () => {}, close: async () => db.close(), backup: () => {} } as unknown as DbHandle;
  ctx = contextFor('destino');
});
afterEach(async () => {
  await handle.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('ArtifactImporter: pasta', () => {
  beforeEach(() => {
    write('origem/skills/revisar/SKILL.md', skillMd('revisar'));
    write('origem/skills/revisar/refs/guia.md', 'guia');
    write('origem/agents/dev.md', agentMd('dev'));
    write('origem/rules/estilo.md', 'Use tabs');
    write('origem/.mcp.json', JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['gh'], env: { GH: 'segredo-do-gh' } } } }));
  });

  it('monta a prévia com os quatro tipos e marca o que já existe', async () => {
    repo().upsert(ctx.boardId, draft('skill', 'revisar'));
    const preview = await new ArtifactImporter(ctx).scan({ from: 'folder', path: path.join(root, 'origem') });
    const by = Object.fromEntries(preview.candidates.map((c) => [`${c.kind}:${c.name}`, c]));
    expect(Object.keys(by).sort()).toEqual(['agent:dev', 'mcp:github', 'rule:estilo.md', 'skill:revisar']);
    expect(by['skill:revisar']).toMatchObject({ exists: true, files: 1, description: 'Faz algo' });
    expect(by['agent:dev']!.exists).toBe(false);
    expect(preview.candidates.every((c) => !c.problem)).toBe(true);
  });

  it('o modo inicial: regra desligada e os outros tipos "Pelo card"', async () => {
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'folder', path: path.join(root, 'origem') });
    const result = importer.apply(
      preview.candidates.map((c) => c.key),
      'skip',
    );
    expect(result.problems).toEqual([]);
    expect(result.imported).toHaveLength(4);
    const usage = (kind: ArtifactDraft['kind'], name: string) => repo().get(ctx.boardId, kind, name)!.usage;
    expect(usage('rule', 'estilo.md')).toBe('off');
    expect(usage('skill', 'revisar')).toBe('contextual');
    expect(usage('agent', 'dev')).toBe('contextual');
    expect(usage('mcp', 'github')).toBe('contextual');
    expect(
      repo()
        .content(repo().get(ctx.boardId, 'skill', 'revisar')!.id)
        .files.map((f) => f.path),
    ).toEqual(['refs/guia.md']);
    // a cópia de leitura foi atualizada
    expect(fs.existsSync(path.join(root, 'library/destino/skills/revisar/SKILL.md'))).toBe(true);
  });

  it('o servidor MCP importado fica pendente de revisão e avisa em mcpSecrets', async () => {
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'folder', path: path.join(root, 'origem') });
    const result = importer.apply([preview.candidates.find((c) => c.kind === 'mcp')!.key], 'skip');
    expect(result.mcpSecrets).toEqual(['github: revisão da configuração local']);
    const row = repo().get(ctx.boardId, 'mcp', 'github')!;
    expect(row.mcpCredential?.review).toBe('pending');
    // o segredo tem letras fora do hexadecimal: "abc" aparecia por acaso dentro do secretRef (um hash)
    expect(JSON.stringify(row)).not.toContain('segredo-do-gh');
  });

  it('repetido: substituir mantém o estado atual (ativo/inativo); pular não toca', async () => {
    repo().upsert(ctx.boardId, draft('skill', 'revisar', { body: skillMd('revisar', 'antiga') }), 'contextual');
    repo().upsert(ctx.boardId, draft('rule', 'estilo.md', { body: 'Antiga' }), 'always');
    const importer = new ArtifactImporter(ctx);
    let preview = await importer.scan({ from: 'folder', path: path.join(root, 'origem') });
    const keys = preview.candidates.filter((c) => c.kind === 'skill' || c.kind === 'rule').map((c) => c.key);
    const skipped = importer.apply(keys, 'skip');
    expect(skipped.skipped).toHaveLength(2);
    expect(skipped.imported).toEqual([]);
    expect(repo().get(ctx.boardId, 'skill', 'revisar')!.description).toBe('d-revisar');
    expect(repo().get(ctx.boardId, 'rule', 'estilo.md')!.body).toBe('Antiga');

    preview = await importer.scan({ from: 'folder', path: path.join(root, 'origem') });
    const replaced = importer.apply(
      preview.candidates.filter((c) => c.kind === 'skill' || c.kind === 'rule').map((c) => c.key),
      'replace',
    );
    expect(replaced.imported).toHaveLength(2);
    expect(repo().get(ctx.boardId, 'skill', 'revisar')).toMatchObject({ usage: 'contextual', description: 'Faz algo' });
    expect(repo().get(ctx.boardId, 'rule', 'estilo.md')).toMatchObject({ usage: 'always', body: 'Use tabs' });
  });

  it('o item com problema aparece na prévia e não é gravado', async () => {
    write('origem/skills/Nome Ruim/SKILL.md', skillMd('Nome Ruim'));
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'folder', path: path.join(root, 'origem') });
    const bad = preview.candidates.find((c) => c.name === 'Nome Ruim')!;
    expect(bad.problem).toMatch(/Nome de skill inválido/);
    const result = importer.apply([bad.key, 'nao-existe'], 'skip');
    expect(result.imported).toEqual([]);
    expect(result.problems).toHaveLength(2);
    expect(repo().get(ctx.boardId, 'skill', 'Nome Ruim')).toBeUndefined();
  });

  it('erros em português: pasta inexistente, sem artefatos, apply sem prévia', async () => {
    const importer = new ArtifactImporter(ctx);
    await expect(importer.scan({ from: 'folder', path: path.join(root, 'nao-existe') })).rejects.toThrow('Pasta não encontrada');
    fs.mkdirSync(path.join(root, 'vazia'));
    await expect(importer.scan({ from: 'folder', path: path.join(root, 'vazia') })).rejects.toThrow('Nenhum artefato encontrado');
    expect(() => importer.apply(['x'], 'skip')).toThrow('Leia a origem');
  });
});

describe('ArtifactImporter: repositório git', () => {
  const before = tmpClones();
  const fakeGit =
    (calls: string[][] = []): GitRunner =>
    async (args) => {
      calls.push(args);
      const dest = args[args.length - 1]!;
      fs.mkdirSync(path.join(dest, 'skills/analisar'), { recursive: true });
      fs.writeFileSync(path.join(dest, 'skills/analisar/SKILL.md'), skillMd('analisar', 'Analisa'));
      fs.mkdirSync(path.join(dest, 'outras/limpar'), { recursive: true });
      fs.writeFileSync(path.join(dest, 'outras/limpar/SKILL.md'), skillMd('limpar'));
    };
  const leftovers = () => tmpClones().filter((n) => !before.includes(n));

  it('clona raso, lê as skills da subpasta e grava a origem com o endereço, não a pasta temporária', async () => {
    const calls: string[][] = [];
    const importer = new ArtifactImporter(ctx, { git: fakeGit(calls) });
    const preview = await importer.scan({ from: 'folder', path: 'time/skills', subdir: 'skills' });
    expect(calls[0]).toContain('--depth');
    expect(calls[0]).toContain('--no-recurse-submodules');
    expect(preview.candidates.map((c) => c.name)).toEqual(['analisar']);
    expect(preview.candidates[0]!.origin).toBe('https://github.com/time/skills.git#skills/analisar');
    expect(leftovers()).toHaveLength(1);
    importer.apply([preview.candidates[0]!.key], 'skip');
    expect(repo().get(ctx.boardId, 'skill', 'analisar')!.origin).toBe('https://github.com/time/skills.git#skills/analisar');
    expect(leftovers()).toEqual([]);
  });

  it('o clone é apagado no cancel e numa prévia nova; o que falha também limpa', async () => {
    const importer = new ArtifactImporter(ctx, { git: fakeGit() });
    await importer.scan({ from: 'folder', path: 'time/skills' });
    expect(leftovers()).toHaveLength(1);
    await importer.scan({ from: 'folder', path: 'time/outro' });
    expect(leftovers()).toHaveLength(1);
    importer.cancel();
    expect(leftovers()).toEqual([]);

    const failing = new ArtifactImporter(ctx, {
      git: async () => {
        throw new Error('sem rede');
      },
    });
    await expect(failing.scan({ from: 'folder', path: 'time/skills' })).rejects.toThrow('Não foi possível clonar');
    await expect(new ArtifactImporter(ctx).scan({ from: 'folder', path: 'a b c' })).rejects.toThrow('Origem não reconhecida');
    await expect(importer.scan({ from: 'folder', path: 'time/skills', subdir: '../fora' })).rejects.toThrow('Subpasta inválida');
    expect(leftovers()).toEqual([]);
  });
});

describe('ArtifactImporter: ferramenta instalada', () => {
  beforeEach(() => {
    write('project/CLAUDE.md', 'Regras do projeto');
    write('project/.claude/skills/local/SKILL.md', skillMd('local'));
    write('project/.claude/agents/dev.md', agentMd('dev'));
    write('project/.mcp.json', JSON.stringify({ mcpServers: { db: { command: 'node', env: { URL: 'x' } } } }));
    write('home/.claude/skills/global/SKILL.md', skillMd('global'));
    write('home/.claude/commands/ignorado.md', 'comando');
    write('project/.cursor/rules/cursor-so.mdc', 'regra cursor');
  });

  it('traz regra, skill, agente e MCP do projeto e do global, sem comandos, e não grava nas pastas das ferramentas', async () => {
    const snapshot = [...tree(path.join(root, 'project')), ...tree(path.join(root, 'home'))];
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'tool', tool: 'claude' });
    const names = preview.candidates.map((c) => `${c.kind}:${c.name}`).sort();
    expect(names).toEqual(['agent:dev', 'mcp:db', 'rule:CLAUDE.md', 'skill:global', 'skill:local']);
    importer.apply(
      preview.candidates.map((c) => c.key),
      'skip',
    );
    expect(repo().get(ctx.boardId, 'skill', 'global')!.originTool).toBe('claude');
    expect([...tree(path.join(root, 'project')), ...tree(path.join(root, 'home'))]).toEqual(snapshot);
  });

  it('segue o adaptador da ferramenta escolhida (o Cursor lê só a pasta .cursor: não traz o CLAUDE.md nem as skills do .claude)', async () => {
    const preview = await new ArtifactImporter(ctx).scan({ from: 'tool', tool: 'cursor' });
    const names = preview.candidates.map((c) => c.name);
    expect(names).toContain('cursor-so.mdc');
    expect(names).not.toContain('CLAUDE.md');
    expect(names).not.toContain('local');
  });
});

describe('ArtifactImporter: arquivo exportado', () => {
  let exported: string;

  beforeEach(() => {
    const source = contextFor('origem-export');
    const r = source.library.repo;
    r.upsert(
      source.boardId,
      draft('skill', 'revisar', { files: [{ path: 'refs/a.md', content: 'ref', encoding: 'utf8', size: 3 }] }),
      'always',
    );
    r.upsert(source.boardId, draft('rule', 'estilo.md'), 'always');
    r.upsert(source.boardId, draft('mcp', 'github'), 'always');
    exported = path.join(root, 'board.fazai.json');
    fs.writeFileSync(exported, JSON.stringify(exportBoard(handle.db, source.boardId, source.store, { extensionVersion: '1.0.0' }).file));
  });

  it('lê os artefatos e os apoios; segredos não vêm e o servidor entra pendente, sem configuração, e volta em mcpSecrets', async () => {
    expect(fs.readFileSync(exported, 'utf8')).not.toContain('segredo-do-board');
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'export', path: exported });
    expect(preview.candidates.map((c) => `${c.kind}:${c.name}`).sort()).toEqual(['mcp:github', 'rule:estilo.md', 'skill:revisar']);
    expect(preview.candidates.every((c) => !c.problem)).toBe(true);
    expect(preview.candidates.find((c) => c.kind === 'skill')).toMatchObject({ files: 1, origin: 'board.fazai.json#revisar' });
    const result = importer.apply(
      preview.candidates.map((c) => c.key),
      'skip',
    );
    expect(result.mcpSecrets).toEqual(['github: revisão da configuração local']);
    expect(repo().get(ctx.boardId, 'rule', 'estilo.md')!.usage).toBe('off');
    expect(repo().get(ctx.boardId, 'skill', 'revisar')!.usage).toBe('contextual');
    expect(repo().content(repo().get(ctx.boardId, 'skill', 'revisar')!.id).files).toHaveLength(1);
    const mcp = repo().get(ctx.boardId, 'mcp', 'github')!;
    expect(mcp.mcpCredential?.review).toBe('pending');
    expect(mcp.missing).toBe(true);
  });

  it('o export sem configuração não substitui o servidor que já existe', async () => {
    repo().upsert(ctx.boardId, draft('mcp', 'github'), 'always');
    const importer = new ArtifactImporter(ctx);
    const preview = await importer.scan({ from: 'export', path: exported });
    const result = importer.apply([preview.candidates.find((c) => c.kind === 'mcp')!.key], 'replace');
    expect(result.imported).toEqual([]);
    expect(result.problems[0]).toMatch(/configuração do servidor/);
    expect(repo().get(ctx.boardId, 'mcp', 'github')).toMatchObject({ usage: 'always', missing: false });
  });

  it('arquivo inválido: o motivo do parseExportFile', async () => {
    const bad = write('ruim.json', '{"a":1}');
    await expect(new ArtifactImporter(ctx).scan({ from: 'export', path: bad })).rejects.toThrow('Arquivo não é um export do Faz AI');
    await expect(new ArtifactImporter(ctx).scan({ from: 'export', path: path.join(root, 'x.json') })).rejects.toThrow(
      'Arquivo não encontrado',
    );
  });
});
