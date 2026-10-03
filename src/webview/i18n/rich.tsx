import { Fragment, type ReactNode } from 'react';
import { fill, translation } from './index';

type Tag = 'b' | 'i' | 'code';
const TOKEN = /(<\/?(?:b|i|code)>|\{\w+\})/;

/**
 * Texto traduzido com negrito, itálico e código: `rich('Use <b>isto</b> em <code>{pasta}</code>', { pasta })`.
 * `{nome}` aceita texto ou elemento React. Só as tags <b>, <i> e <code> existem; nada de HTML solto.
 */
export function rich(key: string, params: Record<string, ReactNode> = {}): ReactNode {
  const parts = (translation(key) ?? key).split(TOKEN).filter((p) => p !== '');
  // pilha de elementos abertos; cada nível guarda seus filhos
  const stack: { tag: Tag | null; children: ReactNode[] }[] = [{ tag: null, children: [] }];
  const top = () => stack[stack.length - 1]!;
  for (const part of parts) {
    const open = /^<(b|i|code)>$/.exec(part);
    const close = /^<\/(b|i|code)>$/.exec(part);
    const param = /^\{(\w+)\}$/.exec(part);
    if (open) stack.push({ tag: open[1] as Tag, children: [] });
    else if (close && stack.length > 1) {
      const done = stack.pop()!;
      const Tag = done.tag!;
      top().children.push(<Tag key={top().children.length}>{done.children}</Tag>);
    } else if (param && param[1]! in params) top().children.push(<Fragment key={top().children.length}>{params[param[1]!]}</Fragment>);
    else top().children.push(fill(part));
  }
  // tag aberta e não fechada: devolve o que tem, sem perder texto
  while (stack.length > 1) {
    const done = stack.pop()!;
    top().children.push(...done.children);
  }
  return <>{stack[0]!.children}</>;
}
