// Teste real do Cursor CLI (fora do `npm test`): o hook global do board nega servidor MCP, subagente e
// ferramenta fora do card, o registro da execução mostra a negação, sem manifesto o Cursor não muda e
// o manifesto some no fim, inclusive cancelando. CLI ausente ou sem login = falha, nunca "passou".
// Mexe no ~/.cursor/hooks.json real da pessoa: faz cópia e restaura no fim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSync } from 'esbuild';
import { manifestPath, writeManifest, MANIFEST_DIR_ENV, type CursorManifest } from '../../src/extension/ai/cursorManifest';
import { installCursorHook, uninstallCursorHook } from '../../src/extension/mcp/cursorHooks';

const home = os.homedir();
const hooksJson = path.join(home, '.cursor', 'hooks.json');
let root: string;
let project: string;
let manifestDir: string;
let backup: string | null;
let version = '';

const FAKE_MCP = `const fs=require('fs');const name=process.argv[2],marker=process.argv[3];let buf='';
process.stdin.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;const m=JSON.parse(l);
const send=r=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...r})+'\\n');
if(m.method==='initialize')send({result:{protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name,version:'1'}}});
else if(m.method==='tools/list')send({result:{tools:[{name:'ping',description:'Registra uma chamada de '+name,inputSchema:{type:'object',properties:{}}}]}});
else if(m.method==='tools/call'){fs.appendFileSync(marker,'called\\n');send({result:{content:[{type:'text',text:'pong '+name}]}});}
else if(m.id!==undefined)send({result:{}});}});`;

const marker = (n: string): string => path.join(root, `${n}.marker`);

function manifest(over: Partial<CursorManifest> = {}): CursorManifest {
  return { runId: 'real', mcpServers: ['allowed'], subagents: [], tools: [], skills: [], createdAt: new Date().toISOString(), ...over };
}

interface Run {
  out: string;
  code: number | null;
}
function agent(prompt: string, o: { killAfterMs?: number; onStart?: () => void } = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn('agent', ['-p', '--force', '--trust', '--approve-mcps', '--output-format', 'stream-json', prompt], {
      cwd: project,
      env: { ...process.env, [MANIFEST_DIR_ENV]: manifestDir },
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d));
    child.stderr.on('data', (d: Buffer) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 80_000);
    if (o.killAfterMs) setTimeout(() => child.kill('SIGKILL'), o.killAfterMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ out, code });
    });
  });
}

beforeAll(() => {
  const v = spawnSync('agent', ['--version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) throw new Error('Cursor CLI (agent) ausente: o teste real NÃO foi validado.');
  version = v.stdout.trim();
  const st = spawnSync('agent', ['status'], { encoding: 'utf8' });
  if (st.status !== 0 || /not logged in/i.test(st.stdout + st.stderr))
    throw new Error('Cursor CLI sem login: o teste real NÃO foi validado.');
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'faz-cursor-real-')));
  project = path.join(root, 'proj');
  manifestDir = path.join(root, 'manifests');
  fs.mkdirSync(path.join(project, '.cursor', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'mcp.js'), FAKE_MCP);
  const srv = (n: string) => ({ command: 'node', args: [path.join(root, 'mcp.js'), n, marker(n)] });
  fs.writeFileSync(
    path.join(project, '.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { allowed: srv('allowed'), forbidden: srv('forbidden') } }),
  );
  fs.writeFileSync(
    path.join(project, '.cursor', 'agents', 'extra.md'),
    '---\nname: extra\ndescription: Subagente extra de teste. Use quando pedirem o subagente extra.\n---\nResponda apenas "extra-ok".\n',
  );
  // hook do código atual, empacotado como a extensão faz
  const script = path.join(root, 'cursor-hook.js');
  buildSync({
    entryPoints: ['src/extension/ai/cursorHookMain.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: script,
    logLevel: 'silent',
  });
  backup = fs.existsSync(hooksJson) ? fs.readFileSync(hooksJson, 'utf8') : null;
  const r = installCursorHook({ homeDir: home, scriptPath: script });
  if (r === 'invalid') throw new Error('~/.cursor/hooks.json inválido: não foi possível instalar o hook.');
});

afterAll(() => {
  if (!root) return;
  if (backup === null) uninstallCursorHook(home);
  else fs.writeFileSync(hooksJson, backup);
  if (backup === null && fs.existsSync(hooksJson)) fs.rmSync(hooksJson);
  fs.rmSync(root, { recursive: true, force: true });
});

const PROMPT =
  "Faça nesta ordem, sem pedir confirmação: 1) chame a ferramenta ping do servidor MCP 'forbidden'; 2) chame a ping do servidor MCP 'allowed'; 3) delegue ao subagente 'extra' pela ferramenta Task. Relate o resultado de cada passo.";

describe('garantia do harness no Cursor CLI real', () => {
  it('com o manifesto do card: nega servidor e subagente fora dele, libera o permitido e registra a negação', async () => {
    const dispose = writeManifest(manifestDir, project, manifest());
    expect(fs.existsSync(manifestPath(manifestDir, project))).toBe(true);
    let r: Run;
    try {
      r = await agent(PROMPT);
    } finally {
      dispose();
    }
    console.log(
      JSON.stringify({ cursor: version, forbidden: fs.existsSync(marker('forbidden')), allowed: fs.existsSync(marker('allowed')) }),
    );
    expect(r.code, r.out.slice(-800)).toBe(0);
    // controle positivo: o servidor do card funciona
    expect(fs.existsSync(marker('allowed'))).toBe(true);
    // negados: o servidor fora do card nunca executou a ferramenta
    expect(fs.existsSync(marker('forbidden'))).toBe(false);
    // o registro da execução mostra a negação, com o motivo do board
    expect(r.out).toMatch(/Faz AI: o servidor MCP \\?"forbidden\\?" não está entre os permitidos/);
    expect(r.out).toMatch(/Faz AI: o subagente \\?"extra\\?" não está entre os permitidos/);
    expect(r.out).not.toContain('extra-ok');
    // o manifesto some no fim
    expect(fs.existsSync(manifestPath(manifestDir, project))).toBe(false);
  });

  it('ferramenta fora do card é negada (tools restritas)', async () => {
    fs.rmSync(marker('allowed'), { force: true });
    const dispose = writeManifest(manifestDir, project, manifest({ tools: ['Read'], mcpServers: ['allowed'] }));
    let r: Run;
    try {
      r = await agent("Chame a ferramenta ping do servidor MCP 'allowed' e relate o resultado.");
    } finally {
      dispose();
    }
    expect(r.out, 'a ferramenta MCP fora de `tools` precisa ser negada').toMatch(
      /Faz AI: a ferramenta \\?"[^"]+\\?" não está entre as permitidas/,
    );
    expect(fs.existsSync(marker('allowed'))).toBe(false);
  });

  it('sem manifesto o Cursor não muda: tudo é liberado', async () => {
    fs.rmSync(marker('forbidden'), { force: true });
    expect(fs.existsSync(manifestPath(manifestDir, project))).toBe(false);
    const r = await agent(PROMPT);
    expect(r.code, r.out.slice(-800)).toBe(0);
    expect(fs.existsSync(marker('forbidden'))).toBe(true);
    expect(r.out).not.toContain('Faz AI:');
  });

  it('cancelar a execução também apaga o manifesto', async () => {
    const dispose = writeManifest(manifestDir, project, manifest());
    try {
      const r = await agent(PROMPT, { killAfterMs: 4_000 });
      expect(r.code).not.toBe(0);
    } finally {
      dispose();
    }
    expect(fs.existsSync(manifestPath(manifestDir, project))).toBe(false);
  });
});
