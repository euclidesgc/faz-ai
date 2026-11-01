// Regras de layout do DESIGN.md ("Layout e espaçamento") que dá para conferir no código: cada padrão tem um
// componente, e quem monta a tela não refaz o espaçamento à mão (o "Refinar os cards novos do Backlog" ficou colado
// no campo de cima porque a explicação era um texto solto depois do interruptor, num bloco sem espaço entre filhos).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../src/webview');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : /\.tsx?$/.test(e.name) ? [full] : [];
  });
const sources = files(ROOT).map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }));
const offenders = (test: (text: string, file: string) => boolean) => sources.filter((s) => test(s.text, s.file)).map((s) => s.file);

it('a explicação de um interruptor vai no `hint` do SwitchField, não num texto solto logo depois dele', () => {
  expect(offenders((text) => /<SwitchField\b(?:(?!<SwitchField)(?!\/>)[\s\S])*?\/>\s*<Text\s+as="p"/.test(text))).toEqual([]);
});

it('número com unidade é o `unit` do NumberField: a classe unit-field não é montada à mão', () => {
  expect(offenders((text, file) => file !== path.join('components', 'ui', 'NumberField.tsx') && text.includes('unit-field'))).toEqual([]);
});

it('espaço não vem de estilo inline: margem e padding ficam no CSS, e o espaço entre irmãos no gap do pai (Stack)', () => {
  expect(offenders((text) => /style=\{\{[^}]*\b(margin|padding)\w*\s*:/.test(text))).toEqual([]);
});

it('todo bloco recolhível usa o Summary (a seta do board), não o <summary> com o triângulo do navegador', () => {
  expect(offenders((text, file) => file !== path.join('components', 'ui', 'Summary.tsx') && /<summary\b/.test(text))).toEqual([]);
});

it('ícone não vem de símbolo de texto no CSS (content: "▾"): é um ícone do board no componente', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const symbols = [...css.matchAll(/content:\s*(['"])(.+?)\1/g)].map((m) => m[2]).filter((c) => c !== '');
  expect(symbols).toEqual([]);
});
