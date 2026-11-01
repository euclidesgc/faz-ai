import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ARMS, armDir, checkUvx, fixtureHash, loadArm, parseArm, readManifest, type ArmManifest } from '../../evals/lib/harnessArm';
import { ArtifactRepo } from '../../src/extension/repositories/artifactRepo';
import { artifactLocation } from '../../src/shared/artifacts';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from '../scenarios/cardWorld';

// Os fixtures destes testes são sintéticos, em pasta temporária: a pasta real `evals/harness/` é de outra sub-tarefa.

const temp: string[] = [];
const worlds: CardWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
  for (const d of temp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const write = (dir: string, rel: string, content: string) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const agentFile = (name: string, o: { tools: string; skills?: string; mcp?: string; body?: string }) =>
  [
    '---',
    `name: "${name}"`,
    `description: "Agente ${name} do fixture."`,
    `tools: ${o.tools}`,
    ...(o.skills ? [`skills: ${o.skills}`] : []),
    ...(o.mcp ? [`faz-ai-mcp: ${o.mcp}`] : []),
    '---',
    '',
    o.body ?? `Instruções do ${name}.`,
    '',
  ].join('\n');

const MCP_JSON = JSON.stringify({
  mcpServers: { 'code-review-graph': { command: 'uvx', args: ['code-review-graph', 'serve'], type: 'stdio', cwd: '/nao/deve/ir' } },
});

/** Um braço sintético: o condutor, o analista (com o MCP), uma skill com arquivo de apoio e a regra. */
function makeArm(arm: 'A' | 'B', patch: (manifest: ArmManifest, dir: string) => void = () => {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-arm-'));
  temp.push(root);
  const dir = path.join(root, arm);
  const b = arm === 'B';
  write(
    dir,
    'agents/condutor-do-board.md',
    agentFile('condutor-do-board', { tools: b ? 'Read, Grep, Glob, Bash' : 'Read, Grep, Glob, Agent, Bash', skills: 'sk-um' }),
  );
  write(
    dir,
    'agents/analista-de-codigo.md',
    agentFile('analista-de-codigo', {
      tools: b ? 'Read, Grep, mcp__code-review-graph__*' : 'Read, Grep, ToolSearch, mcp__code-review-graph__*',
      skills: 'sk-um',
      mcp: 'code-review-graph',
    }),
  );
  write(dir, 'skills/sk-um/SKILL.md', '---\nname: sk-um\ndescription: Skill um.\n---\n\nCorpo da skill um.\n');
  write(dir, 'skills/sk-um/references/apoio.md', 'apoio\n');
  write(dir, 'rules/CLAUDE.md', '# Regras do fixture\n');
  write(dir, '.mcp.json', MCP_JSON);
  const manifest: ArmManifest = {
    arm,
    description: `Braço ${arm} sintético`,
    items: {
      'agent:condutor-do-board': 'contextual',
      'agent:analista-de-codigo': 'contextual',
      'skill:sk-um': 'contextual',
      'rule:CLAUDE.md': 'always',
      'mcp:code-review-graph': b ? 'contextual' : 'always',
    },
    notMeasured: b ? ['divisão da faz-ai-fluxo', 'não aplicada em B'] : ['divisão da faz-ai-fluxo'],
  };
  patch(manifest, dir);
  write(dir, 'arm.json', JSON.stringify(manifest, null, 2));
  return dir;
}

describe('parseArm', () => {
  it('aceita A e B e trata a ausência como sem braço', () => {
    expect(parseArm('A')).toBe('A');
    expect(parseArm('B')).toBe('B');
    expect(parseArm(undefined)).toBeNull();
  });

  it('recusa qualquer outro valor, inclusive o vazio', () => {
    expect(() => parseArm('C')).toThrow('Valor inválido para --arm: "C". Use A ou B.');
    expect(() => parseArm('')).toThrow('Valor inválido para --arm: "". Use A ou B.');
    expect(() => parseArm('a')).toThrow(/Use A ou B/);
  });
});

describe('armDir', () => {
  it('aponta para evals/harness/<braço> na raiz do repositório', () => {
    for (const arm of ARMS) expect(armDir(arm)).toBe(path.resolve(__dirname, '..', '..', 'evals', 'harness', arm));
  });
});

describe('readManifest', () => {
  it('lê um braço válido', () => {
    const dir = makeArm('A');
    const m = readManifest(dir);
    expect(m.arm).toBe('A');
    expect(Object.keys(m.items)).toHaveLength(5);
    expect(m.notMeasured).toEqual(['divisão da faz-ai-fluxo']);
  });

  it('ignora o lixo do sistema de arquivos', () => {
    const dir = makeArm('A');
    write(dir, 'skills/.DS_Store', 'x');
    expect(() => readManifest(dir)).not.toThrow();
  });

  it('exige o arm.json e JSON válido', () => {
    const dir = makeArm('A');
    write(dir, 'arm.json', '{ nao e json');
    expect(() => readManifest(dir)).toThrow(/arm\.json não é JSON válido/);
    fs.rmSync(path.join(dir, 'arm.json'));
    expect(() => readManifest(dir)).toThrow(/Falta o arm\.json/);
  });

  it('recusa o `arm` que não é o da pasta', () => {
    const dir = makeArm('A', (m) => {
      m.arm = 'B';
    });
    expect(() => readManifest(dir)).toThrow(/declara o braço "B", mas a pasta é A/);
  });

  it('recusa campos fora do formato', () => {
    const noNotMeasured = makeArm('A', (m) => {
      (m as unknown as Record<string, unknown>).notMeasured = 'texto';
    });
    expect(() => readManifest(noNotMeasured)).toThrow(/notMeasured/);
    const badKey = makeArm('A', (m) => {
      (m.items as Record<string, string>)['prompt:x'] = 'always';
    });
    expect(() => readManifest(badKey)).toThrow(/chave inválida "prompt:x"/);
  });

  it('recusa o modo que o tipo não aceita', () => {
    const cases: [string, string][] = [
      ['agent:analista-de-codigo', 'always'],
      ['skill:sk-um', 'off'],
      ['mcp:code-review-graph', 'off'],
      ['rule:CLAUDE.md', 'contextual'], // regra "Pelo card" é recusada, não normalizada em silêncio
      ['skill:sk-um', 'sempre'],
    ];
    for (const [key, mode] of cases) {
      const dir = makeArm('A', (m) => {
        (m.items as Record<string, string>)[key] = mode;
      });
      expect(() => readManifest(dir), `${key}=${mode}`).toThrow(new RegExp(`modo "${mode}" inválido para ${key.replace('*', '\\*')}`));
    }
  });

  it('exige o agente padrão no manifesto e ligado', () => {
    const absent = makeArm('A', (m) => {
      delete (m.items as Record<string, string>)['agent:condutor-do-board'];
    });
    expect(() => readManifest(absent)).toThrow(/agente padrão condutor-do-board precisa estar/);
    const off = makeArm('A', (m) => {
      m.items['agent:condutor-do-board'] = 'off';
    });
    expect(() => readManifest(off)).toThrow(/agente padrão condutor-do-board não pode ficar off/);
  });

  it('recusa item do manifesto sem arquivo no fixture', () => {
    for (const [key, missing] of [
      ['agent:fantasma', 'agent:fantasma'],
      ['skill:fantasma', 'skill:fantasma'],
      ['rule:OUTRA.md', 'rule:OUTRA.md'],
      ['mcp:fantasma', 'mcp:fantasma'],
    ] as const) {
      const dir = makeArm('A', (m) => {
        m.items[key] = key.startsWith('rule') ? 'always' : 'contextual';
      });
      expect(() => readManifest(dir)).toThrow(new RegExp(`sem arquivo no fixture: ${missing}`));
    }
  });

  it('recusa arquivo do fixture fora do manifesto, sem nada oculto', () => {
    const agent = makeArm('A');
    write(agent, 'agents/escondido.md', agentFile('escondido', { tools: 'Read' }));
    expect(() => readManifest(agent)).toThrow(/fora do arm\.json: agent:escondido/);

    const skill = makeArm('A');
    write(skill, 'skills/oculta/SKILL.md', '---\nname: oculta\ndescription: x\n---\n');
    expect(() => readManifest(skill)).toThrow(/fora do arm\.json: skill:oculta/);

    const rule = makeArm('A');
    write(rule, 'rules/EXTRA.md', 'x');
    expect(() => readManifest(rule)).toThrow(/fora do arm\.json: rule:EXTRA\.md/);

    const mcp = makeArm('A');
    write(mcp, '.mcp.json', JSON.stringify({ mcpServers: { 'code-review-graph': { command: 'uvx' }, outro: { command: 'x' } } }));
    expect(() => readManifest(mcp)).toThrow(/fora do arm\.json: mcp:outro/);

    const stray = makeArm('A');
    write(stray, 'notas.txt', 'x');
    expect(() => readManifest(stray)).toThrow(/fora do formato.*notas\.txt/);
  });

  it('recusa .mcp.json inválido', () => {
    const dir = makeArm('A');
    write(dir, '.mcp.json', '{');
    expect(() => readManifest(dir)).toThrow(/\.mcp\.json do fixture não é JSON válido/);
    write(dir, '.mcp.json', '{}');
    expect(() => readManifest(dir)).toThrow(/mcpServers/);
  });
});

describe('fixtureHash', () => {
  it('é estável entre leituras e igual para o mesmo conteúdo em outra pasta', () => {
    const a = makeArm('A');
    const first = fixtureHash(a);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureHash(a)).toBe(first);
    expect(fixtureHash(makeArm('A'))).toBe(first);
  });

  it('muda quando o conteúdo, o nome ou a existência de um arquivo muda', () => {
    const dir = makeArm('A');
    const base = fixtureHash(dir);
    write(dir, 'rules/CLAUDE.md', '# Outra regra\n');
    const changed = fixtureHash(dir);
    expect(changed).not.toBe(base);
    write(dir, 'skills/sk-um/references/novo.md', 'x');
    expect(fixtureHash(dir)).not.toBe(changed);
    // o mesmo conteúdo em outro caminho não é o mesmo fixture
    const renamed = makeArm('A');
    fs.renameSync(path.join(renamed, 'skills/sk-um/references/apoio.md'), path.join(renamed, 'skills/sk-um/references/outro.md'));
    expect(fixtureHash(renamed)).not.toBe(base);
  });
});

describe('checkUvx', () => {
  it('passa quando o uvx responde', () => {
    const calls: string[][] = [];
    expect(() =>
      checkUvx((cmd, args) => {
        calls.push([cmd, ...args]);
        return { status: 0 };
      }),
    ).not.toThrow();
    expect(calls).toEqual([['uvx', '--version']]);
  });

  it('lança com a instrução de instalação quando não há uvx ou ele falha', () => {
    for (const status of [null, 127, 1]) {
      expect(() => checkUvx(() => ({ status }))).toThrow(/uvx não encontrado\. Instale com "pipx install uv" ou "brew install uv"/);
    }
  });
});

describe('loadArm', () => {
  const snapshotItems = (w: CardWorld) =>
    w.router
      .snapshot()
      .harness.library!.artifacts.filter((a) => !a.generated)
      .map((a) => [`${a.kind}:${a.name}`, a.usage] as const)
      .sort(([x], [y]) => x.localeCompare(y));

  const load = async (arm: 'A' | 'B', dir = makeArm(arm)) => {
    const world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS });
    worlds.push(world);
    // os agentes de fábrica do host (o `cardWorld` só cria o condutor, que o fixture sobrescreve)
    world.router.handle({ type: 'harness.agents.seed' });
    return { world, dir, info: loadArm(world.router, arm, dir) };
  };

  it('deixa o board com exatamente os itens e modos do manifesto A', async () => {
    const { world, dir, info } = await load('A');
    const manifest = readManifest(dir);
    expect(info).toEqual({ arm: 'A', hash: fixtureHash(dir), items: 5, notMeasured: ['divisão da faz-ai-fluxo'] });
    const items = snapshotItems(world);
    for (const [key, mode] of Object.entries(manifest.items)) expect(items, key).toContainEqual([key, mode]);
    // além do fixture só ficam agentes de fábrica, desligados
    const extras = items.filter(([key]) => !(key in manifest.items));
    expect(extras.length).toBeGreaterThan(0);
    for (const [key, mode] of extras) {
      expect(key.startsWith('agent:'), key).toBe(true);
      expect(mode, key).toBe('off');
    }
  });

  it('grava o MCP revisado e ativo, sem o cwd do .mcp.json', async () => {
    const { world } = await load('A');
    const mcp = world.router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    expect(mcp.name).toBe('code-review-graph');
    expect(mcp.mcpCredential?.review).toBe('reviewed');
    expect(mcp.usage).toBe('always');
    // o que a execução recebe (`mcpDefinitions` só devolve o revisado): o comando do fixture, sem o `cwd`
    const definitions = new ArtifactRepo(world.db).mcpDefinitions(world.router.boardId);
    expect(definitions['code-review-graph']).toEqual({ command: 'uvx', args: ['code-review-graph', 'serve'], env: {} });
  });

  it('traz o condutor com o conteúdo do fixture e os agentes com as tools, skills e MCP do arquivo', async () => {
    const { world, dir } = await load('A');
    const agents = world.router.snapshot().harness.library!.artifacts.filter((a) => a.kind === 'agent');
    const condutor = agents.find((a) => a.name === 'condutor-do-board')!;
    expect(condutor.body).toBe('Instruções do condutor-do-board.');
    expect(condutor.usage).toBe('contextual');
    expect(condutor.agent!.tools.native.allow).toEqual(['Read', 'Grep', 'Glob', 'Agent', 'Bash']);
    expect(condutor.agent!.skills).toEqual(['sk-um']);
    expect(condutor.agent!.mcpServers).toEqual([]);

    const analista = agents.find((a) => a.name === 'analista-de-codigo')!;
    expect(analista.agent!.tools.native.allow).toEqual(['Read', 'Grep', 'ToolSearch', 'mcp__code-review-graph__*']);
    expect(analista.agent!.skills).toEqual(['sk-um']);
    expect(analista.agent!.mcpServers).toEqual(['code-review-graph']);
    // o corpo do arquivo do fixture é o do agente carregado
    expect(fs.readFileSync(path.join(dir, 'agents/analista-de-codigo.md'), 'utf8')).toContain(analista.body);
  });

  it('importa a skill com o arquivo de apoio e a regra no modo do manifesto', async () => {
    const { world } = await load('A');
    const artifacts = world.router.snapshot().harness.library!.artifacts;
    expect(artifacts.find((a) => a.kind === 'skill' && a.name === 'sk-um')).toMatchObject({
      usage: 'contextual',
      files: ['references/apoio.md'],
    });
    expect(artifacts.find((a) => a.kind === 'rule')).toMatchObject({ name: 'CLAUDE.md', usage: 'always' });
  });

  it('em um board novo, B difere de A exatamente no declarado', async () => {
    const a = await load('A');
    const b = await load('B');
    const diff = (x: ReturnType<typeof snapshotItems>, y: ReturnType<typeof snapshotItems>) =>
      x.filter(([key, mode]) => y.find(([k]) => k === key)?.[1] !== mode).map(([key]) => key);
    expect(diff(snapshotItems(a.world), snapshotItems(b.world))).toEqual(['mcp:code-review-graph']);
    const agentsOf = (w: CardWorld) => w.router.snapshot().harness.library!.artifacts.filter((x) => x.kind === 'agent');
    const toolsOf = (w: CardWorld, name: string) => agentsOf(w).find((x) => x.name === name)!.agent!.tools.native.allow;
    expect(toolsOf(a.world, 'condutor-do-board')).toContain('Agent');
    expect(toolsOf(b.world, 'condutor-do-board')).not.toContain('Agent');
    expect(toolsOf(b.world, 'analista-de-codigo')).not.toContain('ToolSearch');
  });

  it('carregar de novo no mesmo board converge para o mesmo estado', async () => {
    const { world, dir } = await load('A');
    const before = snapshotItems(world);
    loadArm(world.router, 'A', dir);
    expect(snapshotItems(world)).toEqual(before);
  });

  it('marca o modo pela location do snapshot, não por uma montada à mão', async () => {
    const { world } = await load('B');
    const mcp = world.router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    const selection = world.router.snapshot().harnessSelection;
    expect(selection).toContainEqual({ kind: 'mcp', location: artifactLocation(mcp), usage: 'contextual' });
  });

  it('não escreve fora do diretório temporário do mundo', async () => {
    const realLibrary = path.join(os.homedir(), 'faz-ai-library');
    const before = fs.existsSync(realLibrary) ? fs.readdirSync(realLibrary).sort() : null;
    const { world } = await load('A');
    const library = world.router.snapshot().harness.library!;
    expect(library.directory.startsWith(world.root)).toBe(true);
    for (const a of library.artifacts) if (a.path) expect(a.path.startsWith(world.root), a.path).toBe(true);
    expect(fs.existsSync(realLibrary) ? fs.readdirSync(realLibrary).sort() : null).toEqual(before);
  });

  it('lança com a lista quando o braço puxa um item que o fixture não declara', async () => {
    // o agente lista uma skill que não está no fixture e que existe na home: a dependência entraria sozinha
    const dir = makeArm('A');
    write(
      dir,
      'agents/analista-de-codigo.md',
      agentFile('analista-de-codigo', { tools: 'Read', skills: 'sk-um, sk-externa', mcp: 'code-review-graph' }),
    );
    const world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS });
    worlds.push(world);
    write(world.home, '.claude/skills/sk-externa/SKILL.md', '---\nname: sk-externa\ndescription: de fora\n---\n');
    expect(() => loadArm(world.router, 'A', dir)).toThrow(/O board não ficou igual ao braço A: .*skill:sk-externa: sobra no board/);
  });

  it('recusa o fixture inválido antes de tocar no board', async () => {
    const dir = makeArm('A', (m) => {
      m.items['agent:condutor-do-board'] = 'off';
    });
    const world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS });
    worlds.push(world);
    const before = snapshotItems(world);
    expect(() => loadArm(world.router, 'A', dir)).toThrow(/não pode ficar off/);
    expect(snapshotItems(world)).toEqual(before);
  });
});

describe('fixtures reais evals/harness/A e B', () => {
  const filesOf = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else out.push(path.relative(dir, path.join(d, e.name)).split(path.sep).join('/'));
      }
    };
    walk(dir);
    return out.sort();
  };
  const read = (arm: 'A' | 'B', rel: string) => fs.readFileSync(path.join(armDir(arm), rel), 'utf8');
  /** A linha de frontmatter `key:` do agente, ou '' quando não há. */
  const fmLine = (arm: 'A' | 'B', agent: string, key: string) =>
    read(arm, `agents/${agent}.md`)
      .split('\n')
      .find((l) => l.startsWith(`${key}: `)) ?? '';

  it('readManifest lê as duas pastas e o hash difere', () => {
    const a = readManifest(armDir('A'));
    const b = readManifest(armDir('B'));
    expect(a.arm).toBe('A');
    expect(b.arm).toBe('B');
    expect(Object.keys(a.items).filter((k) => k.startsWith('agent:'))).toHaveLength(9);
    expect(Object.keys(a.items).filter((k) => k.startsWith('skill:')).length).toBeGreaterThanOrEqual(16);
    expect(a.items['rule:CLAUDE.md']).toBe('always');
    expect(a.items['agent:condutor-do-board']).toBe('contextual');
    expect(a.description).toMatch(/30\/10/);
    expect(b.description).toMatch(/30\/10/);
    expect(a.notMeasured).toEqual(['divisão da faz-ai-fluxo (servida por flowSkill.ts)']);
    expect(b.notMeasured.slice(0, 1)).toEqual(a.notMeasured);
    expect(b.notMeasured.join(' ')).toMatch(/não foi aplicada/);
    expect(fixtureHash(armDir('A'))).not.toBe(fixtureHash(armDir('B')));
  });

  it('equivalência: B é A mais exatamente as propostas aprovadas', () => {
    const a = readManifest(armDir('A'));
    const b = readManifest(armDir('B'));
    // mesmo conjunto de itens; só o modo do MCP muda
    expect(Object.keys(b.items)).toEqual(Object.keys(a.items));
    const modeDiff = Object.keys(a.items).filter((k) => a.items[k as keyof typeof a.items] !== b.items[k as keyof typeof b.items]);
    expect(modeDiff).toEqual(['mcp:code-review-graph']);
    expect(a.items['mcp:code-review-graph']).toBe('always');
    expect(b.items['mcp:code-review-graph']).toBe('contextual');

    // mesmos arquivos; só mudam o arm.json e os cinco agentes da lista
    expect(filesOf(armDir('B'))).toEqual(filesOf(armDir('A')));
    const changed = filesOf(armDir('A')).filter((f) => read('A', f) !== read('B', f));
    expect(changed).toEqual([
      'agents/analista-de-codigo.md',
      'agents/condutor-do-board.md',
      'agents/fluxo-e-mcp.md',
      'agents/frontend-web.md',
      'agents/revisor-de-codigo.md',
      'arm.json',
    ]);

    // dentro de cada agente, só o frontmatter muda (o corpo é igual)
    const body = (arm: 'A' | 'B', agent: string) => read(arm, `agents/${agent}.md`).replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const f of changed.filter((x) => x.startsWith('agents/'))) {
      const name = f.slice('agents/'.length, -3);
      expect(body('B', name), name).toBe(body('A', name));
    }

    expect(fmLine('B', 'condutor-do-board', 'tools')).toBe('tools: Read, Grep, Glob, Bash');
    expect(fmLine('A', 'condutor-do-board', 'tools')).toBe('tools: Read, Grep, Glob, Agent, Bash');
    expect(fmLine('B', 'analista-de-codigo', 'tools')).toBe('tools: Read, Glob, Grep, LSP');
    expect(fmLine('A', 'analista-de-codigo', 'tools')).toBe(
      'tools: Read, Glob, Grep, LSP, ListMcpResourcesTool, ReadMcpResourceTool, ToolSearch',
    );
    expect(fmLine('B', 'fluxo-e-mcp', 'tools')).toBe('tools: Read, Grep, Glob, Edit, Write, Bash');
    expect(fmLine('B', 'frontend-web', 'skills')).toBe('skills: texto-de-interface-i18n, react-component-contracts');
    expect(fmLine('A', 'frontend-web', 'skills')).toBe('');

    // o MCP: só o analista e o revisor o listam em B; em A só o analista (retrato do board real)
    const withMcp = (arm: 'A' | 'B') =>
      filesOf(armDir(arm))
        .filter((f) => f.startsWith('agents/') && read(arm, f).includes('faz-ai-mcp: code-review-graph'))
        .map((f) => f.slice('agents/'.length, -3));
    expect(withMcp('A')).toEqual(['analista-de-codigo']);
    expect(withMcp('B')).toEqual(['analista-de-codigo', 'revisor-de-codigo']);

    // fora do arm.json, nada além dos agentes muda: regra, skills e .mcp.json iguais
    expect(read('B', 'rules/CLAUDE.md')).toBe(read('A', 'rules/CLAUDE.md'));
    expect(read('B', '.mcp.json')).toBe(read('A', '.mcp.json'));
    expect(JSON.parse(read('A', '.mcp.json')).mcpServers['code-review-graph']).toMatchObject({
      command: 'uvx',
      args: ['code-review-graph', 'serve'],
    });
  });

  for (const arm of ARMS) {
    it(`loadArm carrega o braço ${arm} no cardWorld sem diferença`, async () => {
      const world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS });
      worlds.push(world);
      world.router.handle({ type: 'harness.agents.seed' });
      const manifest = readManifest(armDir(arm));
      const info = loadArm(world.router, arm);
      expect(info).toEqual({
        arm,
        hash: fixtureHash(armDir(arm)),
        items: Object.keys(manifest.items).length,
        notMeasured: manifest.notMeasured,
      });
      const artifacts = world.router.snapshot().harness.library!.artifacts;
      for (const [key, mode] of Object.entries(manifest.items))
        expect(artifacts.find((x) => `${x.kind}:${x.name}` === key)?.usage, key).toBe(mode);
      const agent = (name: string) => artifacts.find((x) => x.kind === 'agent' && x.name === name)!.agent!;
      expect(agent('condutor-do-board').tools.native.allow.includes('Agent')).toBe(arm === 'A');
      expect(agent('revisor-de-codigo').mcpServers).toEqual(arm === 'B' ? ['code-review-graph'] : []);
      expect(agent('frontend-web').skills).toEqual(arm === 'B' ? ['texto-de-interface-i18n', 'react-component-contracts'] : []);
    });
  }
});
