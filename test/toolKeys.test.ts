// O cofre das chaves de API por ferramenta (história 7): a chave vai só para o cofre cifrado; o índice guarda
// só a referência, e nada no banco do board a conhece.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalCredentials } from '../src/extension/credentials';
import { ToolKeys, parseApiKey } from '../src/extension/toolKeys';

const KEY = 'AIzaSy-chave-de-teste-123456';
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-keys-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const keysIn = (dir: string) => {
  const store = new LocalCredentials(path.join(dir, 'boards', '.credentials'));
  return { store, keys: new ToolKeys(store, path.join(dir, 'tool-keys.json')) };
};
/** Todo o texto gravado em disco debaixo da pasta, para procurar a chave em claro. */
const everything = (dir: string): string =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => fs.readFileSync(path.join(e.parentPath, e.name), 'utf8'))
    .join('\n');

describe('ToolKeys', () => {
  it('guarda, lê e esquece a chave de uma ferramenta; em disco ela só existe cifrada', () => {
    const { keys } = keysIn(root);
    expect(keys.has('gemini')).toBe(false);
    keys.set('gemini', KEY);
    expect(keys.has('gemini')).toBe(true);
    expect(keys.get('gemini')).toBe(KEY);
    expect(everything(root)).not.toContain(KEY);
    // o índice só tem a referência, e é só da pessoa
    const index = JSON.parse(fs.readFileSync(path.join(root, 'tool-keys.json'), 'utf8'));
    expect(Object.keys(index)).toEqual(['gemini']);
    expect(index.gemini).toMatch(/^[a-f0-9]{64}$/);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(root, 'tool-keys.json')).mode & 0o077).toBe(0);
    keys.remove('gemini');
    expect(keys.get('gemini')).toBeNull();
  });

  it('é a mesma chave em qualquer board da máquina (outra instância, a mesma pasta de dados)', () => {
    keysIn(root).keys.set('gemini', KEY);
    expect(keysIn(root).keys.get('gemini')).toBe(KEY);
  });

  it('o cofre que guardou a chave a mascara em qualquer texto (a ocultação do log usa o mesmo cofre)', () => {
    const { store, keys } = keysIn(root);
    keys.set('gemini', KEY);
    expect(store.redact(`erro com ${KEY} no meio`)).toBe('erro com [credencial local] no meio');
  });

  it('trocar a chave aponta o índice para a nova e apaga a cifrada antiga; esquecer apaga a atual', () => {
    const { keys } = keysIn(root);
    const vault = path.join(root, 'boards', '.credentials');
    const refs = () => fs.readdirSync(vault).filter((f) => /^[a-f0-9]{64}\.json$/.test(f));
    keys.set('gemini', KEY);
    const [first] = refs();
    keys.set('gemini', `${KEY}-nova`);
    expect(keys.get('gemini')).toBe(`${KEY}-nova`);
    expect(refs()).toHaveLength(1);
    expect(refs()).not.toContain(first);
    keys.remove('gemini');
    expect(refs()).toEqual([]);
  });

  it('apagar só tira o arquivo do mesmo dono', () => {
    const { store, keys } = keysIn(root);
    const other = store.put(JSON.stringify(['outro', 'dono']), { valor: 'x' });
    keys.set('gemini', KEY);
    store.delete(JSON.stringify(['tool-key', 'gemini']), other);
    expect(store.has(JSON.stringify(['outro', 'dono']), other)).toBe(true);
  });

  it('recusa chave fora do formato e ferramenta inválida, sem gravar nada', () => {
    const { keys } = keysIn(root);
    expect(() => keys.set('gemini', 'curta')).toThrow(/8 a 512/);
    expect(() => keys.set('gemini', 'tem espaço no meio')).toThrow(/sem espaços/);
    expect(() => keys.set('../fora', KEY)).toThrow(/Ferramenta inválida/);
    expect(fs.existsSync(path.join(root, 'tool-keys.json'))).toBe(false);
  });

  it('índice corrompido ou com referência estranha vale como vazio', () => {
    const { keys } = keysIn(root);
    fs.writeFileSync(path.join(root, 'tool-keys.json'), '{"gemini":"../../etc/passwd"}');
    expect(keys.get('gemini')).toBeNull();
    fs.writeFileSync(path.join(root, 'tool-keys.json'), 'não é json');
    expect(keys.has('gemini')).toBe(false);
  });

  it('parseApiKey tira os espaços das pontas (colar costuma trazer a quebra de linha)', () => {
    expect(parseApiKey(`  ${KEY}\n`)).toEqual({ key: KEY });
    expect(parseApiKey('')).toEqual({ error: 'Cole a chave de API.' });
    expect(parseApiKey(undefined)).toEqual({ error: 'Cole a chave de API.' });
  });
});
