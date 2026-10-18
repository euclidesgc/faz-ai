import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildSync } from 'esbuild';
import { leaseProjectServer, recoverProjectServers, realLeasePath, type LeaseOptions } from '../src/extension/mcp/projectServerLease';

let dir: string;
let root: string;
let options: LeaseOptions;
let lines: string[];
const spec = {
  file: '.cursor/mcp.json',
  entry: { command: 'node', args: ['bridge.js', '/workspace'], env: { TOKEN: 'segredo-sentinela' } },
};
const target = () => path.join(dir, spec.file);
const text = () => fs.readFileSync(target(), 'utf8');
const json = () => JSON.parse(text());
function seed(value: string) {
  fs.mkdirSync(path.dirname(target()), { recursive: true });
  fs.writeFileSync(target(), value);
}
const locks = () => fs.readdirSync(root).filter((name) => /^[a-f0-9]{64}$/.test(name));
function journal() {
  return JSON.parse(fs.readFileSync(path.join(root, locks()[0]!, 'journal.json'), 'utf8'));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-lease-'));
  root = path.join(dir, 'coordination');
  lines = [];
  options = { coordinationDir: root, log: (line) => lines.push(line) };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('empréstimo coordenado do MCP', () => {
  it('registra intenção completa antes da escrita e devolve arquivo e diretório antes inexistentes', () => {
    const lease = leaseProjectServer(dir, spec, {
      ...options,
      checkpoint: (point) => {
        if (point !== 'journal') return;
        expect(fs.existsSync(target())).toBe(false);
        expect(journal()).toMatchObject({ before: null, writtenEntry: { type: 'stdio', ...spec.entry }, phase: 'prepared' });
        expect(JSON.parse(journal().expected).mcpServers['faz-ai']).toEqual({ type: 'stdio', ...spec.entry });
      },
    });
    expect(lease.result).toBe('added');
    expect(json().mcpServers['faz-ai']).toEqual({ type: 'stdio', ...spec.entry });
    if (process.platform !== 'win32') expect(fs.statSync(path.join(root, locks()[0]!, 'journal.json')).mode & 0o777).toBe(0o600);
    expect(lease.release()).toBe(true);
    expect(lease.release()).toBe(true);
    expect(fs.existsSync(target())).toBe(false);
    expect(fs.existsSync(path.dirname(target()))).toBe(false);
    expect(locks()).toEqual([]);
    expect(lines.join('\n')).not.toContain('segredo-sentinela');
  });

  it('restaura bytes e modo originais inclusive a entrada anterior do board', () => {
    const before = '{"outro":true,"mcpServers":{"faz-ai":{"command":"antigo","env":{"TOKEN":"antigo"}},"pessoa":{"command":"meu"}}}\n\n';
    seed(before);
    fs.chmodSync(target(), 0o640);
    const lease = leaseProjectServer(dir, spec, options);
    expect(lease.result).toBe('repaired');
    expect(lease.release()).toBe(true);
    expect(text()).toBe(before);
    if (process.platform !== 'win32') expect(fs.statSync(target()).mode & 0o777).toBe(0o640);
  });

  it('mantém edições de outros servidores e restaura somente a entrada emprestada', () => {
    seed('{"mcpServers":{"pessoa":{"command":"meu"}}}');
    const lease = leaseProjectServer(dir, spec, options);
    const edited = json();
    edited.mcpServers.novo = { command: 'novo' };
    seed(JSON.stringify(edited));
    expect(lease.release()).toBe(true);
    expect(json()).toEqual({ mcpServers: { pessoa: { command: 'meu' }, novo: { command: 'novo' } } });
  });

  it('preserva alteração concorrente da própria entrada faz-ai e retém a prova do conflito', () => {
    const lease = leaseProjectServer(dir, spec, options);
    const edited = json();
    edited.mcpServers['faz-ai'] = { command: 'escolhido-pela-pessoa' };
    seed(JSON.stringify(edited));
    expect(lease.release()).toBe(false);
    expect(json().mcpServers['faz-ai']).toEqual({ command: 'escolhido-pela-pessoa' });
    expect(locks()).toHaveLength(1);
    expect(() => leaseProjectServer(dir, spec, options)).toThrow('emprestado');
    expect(lines.join('\n')).toContain('editada');
  });

  it('JSON inválido impede adquirir e não inicia escrita; corrupção posterior impede restaurar', () => {
    seed('// comentário\n{}');
    expect(() => leaseProjectServer(dir, spec, options)).toThrow();
    expect(text()).toBe('// comentário\n{}');
    expect(locks()).toHaveLength(0);
    seed('{}');
    const lease = leaseProjectServer(dir, spec, options);
    seed('inválido');
    expect(lease.release()).toBe(false);
    expect(text()).toBe('inválido');
    expect(locks()).toHaveLength(1);
  });

  it('uma exclusão da pessoa não recria o arquivo e não remove arquivos de apoio novos', () => {
    const lease = leaseProjectServer(dir, spec, options);
    fs.writeFileSync(path.join(path.dirname(target()), 'pessoa.txt'), 'preservar');
    fs.unlinkSync(target());
    expect(lease.release()).toBe(true);
    expect(fs.existsSync(target())).toBe(false);
    expect(fs.readFileSync(path.join(path.dirname(target()), 'pessoa.txt'), 'utf8')).toBe('preservar');
  });

  it('links para o mesmo caminho disputam uma posse única e a geração muda na próxima posse', () => {
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(dir, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const lease = leaseProjectServer(dir, spec, options);
    expect(realLeasePath(path.join(alias, spec.file))).toBe(lease.file);
    expect(() => leaseProjectServer(alias, spec, options)).toThrow('emprestado');
    expect(lease.release()).toBe(true);
    const next = leaseProjectServer(alias, spec, options);
    expect(next.generation).not.toBe(lease.generation);
    expect(next.release()).toBe(true);
  });

  it('recusa diretórios fora do projeto e conserva o formato sem type do Kimi', () => {
    expect(() => leaseProjectServer(dir, { ...spec, file: '../mcp.json' }, options)).toThrow('fora do projeto');
    const lease = leaseProjectServer(dir, { ...spec, stdioType: false }, options);
    expect(json().mcpServers['faz-ai']).toEqual(spec.entry);
    expect(lease.release()).toBe(true);
  });

  it.each(['journal', 'write'] as const)('recupera queda na fronteira %s sem processo, com conteúdo esperado no WAL', (boundary) => {
    seed('{ "pessoa": true }\n');
    expect(() =>
      leaseProjectServer(dir, spec, {
        ...options,
        checkpoint: (point) => {
          if (point === boundary) throw new Error('queda simulada');
        },
      }),
    ).toThrow('queda simulada');
    expect(locks()).toHaveLength(1);
    expect(recoverProjectServers(options, () => 'dead')).toBe(1);
    expect(text()).toBe('{ "pessoa": true }\n');
    expect(locks()).toEqual([]);
  });

  it('falha antes de publicar o WAL não escreve no projeto', () => {
    fs.mkdirSync(root);
    fs.chmodSync(root, 0o500);
    // Permissões não simulam ENOSPC de forma portável; falha real de destino não diretório faz o mesmo gate.
    const blocked = path.join(dir, 'nao-diretorio');
    fs.writeFileSync(blocked, 'arquivo');
    expect(() => leaseProjectServer(dir, spec, { ...options, coordinationDir: path.join(blocked, 'leases') })).toThrow();
    expect(fs.existsSync(target())).toBe(false);
    fs.chmodSync(root, 0o700);
  });

  it('mantém posse com dono vivo, identidade desconhecida ou processo ainda não confirmado', () => {
    const lease = leaseProjectServer(dir, spec, options);
    expect(recoverProjectServers(options)).toBe(0);
    expect(recoverProjectServers(options, () => 'unknown')).toBe(0);
    lease.markProcessUnconfirmed();
    expect(lease.release()).toBe(false);
    expect(recoverProjectServers(options, () => 'dead')).toBe(0);
    expect(json().mcpServers['faz-ai']).toEqual({ type: 'stdio', ...spec.entry });
    lease.confirmProcessStopped();
    expect(lease.release()).toBe(true);
  });

  it('não sobrescreve edição que chega durante o cálculo da restauração', () => {
    const lease = leaseProjectServer(dir, spec, {
      ...options,
      checkpoint: (point) => {
        if (point === 'restore') seed('{"mcpServers":{"faz-ai":{"command":"mudou"}}}');
      },
    });
    expect(lease.release()).toBe(false);
    expect(json().mcpServers['faz-ai'].command).toBe('mudou');
  });

  it('uma geração trocada não pode ser restaurada pelo dono anterior', () => {
    const lease = leaseProjectServer(dir, spec, options);
    const j = journal();
    j.owner.generation = 'outra-geracao';
    fs.writeFileSync(path.join(root, locks()[0]!, 'journal.json'), JSON.stringify(j));
    expect(() => lease.release()).toThrow('geração');
    expect(json().mcpServers['faz-ai']).toEqual({ type: 'stdio', ...spec.entry });
  });
});

it('coordena processos reais, bloqueia concorrente e recupera a preparação após morte do dono', async () => {
  const bundle = path.join(dir, 'lease.cjs');
  buildSync({
    entryPoints: [path.resolve(__dirname, '../src/extension/mcp/projectServerLease.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
  });
  const script = `const {leaseProjectServer}=require(process.argv[1]); const lease=leaseProjectServer(process.argv[2], JSON.parse(process.argv[3]), {coordinationDir:process.argv[4],log:()=>{}}); console.log('ready'); setInterval(()=>{},1000);`;
  const children: ChildProcess[] = [];
  try {
    const child = spawn(process.execPath, ['-e', script, bundle, dir, JSON.stringify(spec), root], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Dono terminou antes do teste: ${code}`)));
      child.stdout!.once('data', () => resolve());
    });
    expect(() => leaseProjectServer(dir, spec, options)).toThrow('emprestado');
    expect(recoverProjectServers(options)).toBe(0);
    const died = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await died;
    expect(recoverProjectServers(options)).toBe(1);
    expect(fs.existsSync(target())).toBe(false);
  } finally {
    for (const child of children) child.kill('SIGKILL');
  }
});
