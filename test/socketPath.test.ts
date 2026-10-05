import { describe, expect, it } from 'vitest';
import { canonicalFolder, workspaceKey } from '../src/extension/mcp/socketPath';

describe('chave do board de uma pasta', () => {
  it('no Windows, o editor (c:\\) e o terminal (C:\\) chegam à mesma chave', () => {
    expect(canonicalFolder('C:\\Users\\Ana\\proj', 'win32')).toBe('c:\\Users\\Ana\\proj');
    expect(workspaceKey('C:\\Users\\Ana\\proj', 'win32')).toBe(workspaceKey('c:\\Users\\Ana\\proj', 'win32'));
    expect(workspaceKey('c:\\Users\\Ana\\proj\\', 'win32')).toBe(workspaceKey('c:\\Users\\Ana\\proj', 'win32'));
  });

  it('no Linux e no macOS a chave de um board existente não muda', () => {
    // a mesma conta de antes desta mudança: sha1 do caminho como o editor o entrega
    expect(workspaceKey('/home/ana/proj', 'linux')).toBe('8000eaa8705ce57fa74d6386370212d65ed6a113');
    expect(canonicalFolder('/Users/Ana/Proj', 'darwin')).toBe('/Users/Ana/Proj');
  });
});
