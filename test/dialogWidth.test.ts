// A largura de um Dialog.Content do Radix vem de uma classe do board (`board-dialog-sm|md|lg`): as props `maxWidth` e
// `width` dependem do utilities.css do Radix, que não entra, e o diálogo ocupava a tela inteira (importar artefatos).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../src/webview');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : e.name.endsWith('.tsx') ? [full] : [];
  });

it('nenhum componente do Radix recebe maxWidth ou width por prop', () => {
  const offenders = files(ROOT).filter((f) =>
    /<(?:Dialog\.Content|AlertDialog\.Content|Popover\.Content|Card)\b[^>]*\b(?:maxWidth|width)=/s.test(fs.readFileSync(f, 'utf8')),
  );
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});
