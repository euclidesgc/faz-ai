import { describe, expect, it } from 'vitest';
import { canonicalFolder, socketPath, workspaceKey } from '../src/extension/mcp/socketPath';

describe('chave do board de uma pasta', () => {
  it('no Windows, o editor (c:\\) e o terminal (C:\\) chegam à mesma chave', () => {
    expect(canonicalFolder('C:\\Users\\Ana\\proj', 'win32')).toBe('c:\\Users\\Ana\\proj');
    expect(workspaceKey('C:\\Users\\Ana\\proj', 'win32')).toBe(workspaceKey('c:\\Users\\Ana\\proj', 'win32'));
    expect(workspaceKey('c:\\Users\\Ana\\proj\\', 'win32')).toBe(workspaceKey('c:\\Users\\Ana\\proj', 'win32'));
  });

  it('no Windows o named pipe leva o usuário: o pipe é global na máquina e sem ACL', () => {
    const key = workspaceKey('C:\\Users\\Ana\\proj', 'win32').slice(0, 16);
    expect(socketPath('C:\\Users\\Ana\\proj', 'win32', 'Ana Silva')).toBe(`\\\\.\\pipe\\fazai-Ana_Silva-${key}`);
    expect(socketPath('C:\\Users\\Ana\\proj', 'win32', 'ana')).not.toBe(socketPath('C:\\Users\\Ana\\proj', 'win32', 'bia'));
    // sem usuário conhecido, só a chave da pasta
    expect(socketPath('C:\\Users\\Ana\\proj', 'win32', '')).toBe(`\\\\.\\pipe\\fazai-${key}`);
  });

  it('no Linux e no macOS a chave de um board existente não muda', () => {
    // a mesma conta de antes desta mudança: sha1 do caminho como o editor o entrega
    expect(workspaceKey('/home/ana/proj', 'linux')).toBe('8000eaa8705ce57fa74d6386370212d65ed6a113');
    expect(canonicalFolder('/Users/Ana/Proj', 'darwin')).toBe('/Users/Ana/Proj');
  });
});
