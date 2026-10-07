import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { editorFinds, editorMcpFiles, pinEditorCommands, unreachableServers } from '../src/extension/mcp/pinCommands';

let project: string;
let home: string;
let bin: string;
/** o PATH com que o editor abriu: uma pasta sem nenhum dos programas */
let editorPath: string;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-pin-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-pin-home-'));
  bin = path.join(home, '.local', 'bin');
  editorPath = path.join(home, 'editor-bin');
  fs.mkdirSync(editorPath);
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ['uvx', 'node']) fs.writeFileSync(path.join(bin, name), '');
  fs.mkdirSync(path.join(project, '.git', 'info'), { recursive: true });
  fs.mkdirSync(path.join(project, '.cursor'));
  fs.writeFileSync(
    path.join(project, '.cursor', 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        'faz-ai': { command: 'node', args: ['/b/bridge.js', project] },
        'code-review-graph': { command: 'uvx', args: ['code-review-graph', 'serve'] },
        // da pessoa: fica como está, mesmo sem ser achado
        outro: { command: 'sumiu' },
      },
    }),
  );
});
afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

// o programa existe nesta máquina (achado pelo PATH do terminal), mas não no PATH com que o editor abriu
const resolve = (c: string) => (fs.existsSync(path.join(bin, c)) ? path.join(bin, c) : null);
const files = () => editorMcpFiles('cursor', project, home);
const read = () => JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'mcp.json'), 'utf8')).mcpServers;

describe('caminho completo dos MCPs no editor', () => {
  it('acha só o que o editor não acha, entre o board e o Code Review Graph', () => {
    expect(unreachableServers(files(), editorPath, resolve, () => false).map((u) => [u.server, u.command, u.fullPath])).toEqual([
      ['faz-ai', 'node', path.join(bin, 'node')],
      ['code-review-graph', 'uvx', path.join(bin, 'uvx')],
    ]);
    expect(unreachableServers(files(), bin, resolve, () => false)).toEqual([]);
    expect(editorFinds(path.join(bin, 'uvx'), '')).toBe(true);
    expect(editorFinds('/nao/existe/uvx', bin)).toBe(false);
  });

  it('grava o caminho desta máquina, sem tocar nos outros servidores, e deixa o arquivo fora do git', () => {
    const pinned = pinEditorCommands(files(), editorPath, resolve, () => false);
    expect(pinned.map((u) => u.server)).toEqual(['faz-ai', 'code-review-graph']);
    expect(read()).toEqual({
      'faz-ai': { command: path.join(bin, 'node'), args: ['/b/bridge.js', project] },
      'code-review-graph': { command: path.join(bin, 'uvx'), args: ['code-review-graph', 'serve'] },
      outro: { command: 'sumiu' },
    });
    expect(fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8')).toContain('.cursor/mcp.json');
  });

  it('não grava no arquivo do projeto que está no git', () => {
    expect(pinEditorCommands(files(), editorPath, resolve, () => true)).toEqual([]);
    expect(read()['code-review-graph'].command).toBe('uvx');
    expect(unreachableServers(files(), editorPath, resolve, () => true).every((u) => u.tracked)).toBe(true);
  });

  it('sem o programa nesta máquina, não inventa caminho', () => {
    fs.rmSync(path.join(bin, 'uvx'));
    pinEditorCommands(files(), editorPath, resolve, () => false);
    expect(read()['code-review-graph'].command).toBe('uvx');
  });
});
