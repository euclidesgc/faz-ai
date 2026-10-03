import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EN } from '../../src/webview/i18n/en';
import { setLocale, t, tn } from '../../src/webview/i18n';
import { rich } from '../../src/webview/i18n/rich';
import { resolveLocale } from '../../src/shared/language';

afterEach(() => setLocale('pt-BR'));

describe('rich', () => {
  it('negrito, itálico, código e parâmetros (texto ou elemento)', () => {
    render(
      <p aria-label="x">{rich('Use <b>isto</b> em <code>{pasta}</code> e {link}.', { pasta: 'src', link: <a href="#a">aqui</a> })}</p>,
    );
    const p = screen.getByLabelText('x');
    expect(p.querySelector('b')).toHaveTextContent('isto');
    expect(p.querySelector('code')).toHaveTextContent('src');
    expect(p.querySelector('a')).toHaveTextContent('aqui');
    expect(p).toHaveTextContent('Use isto em src e aqui.');
  });

  it('tag aberta e não fechada não perde texto', () => {
    render(<p aria-label="y">{rich('um <b>dois')}</p>);
    expect(screen.getByLabelText('y')).toHaveTextContent('um dois');
  });

  it('em inglês usa a tradução, mantendo as tags', () => {
    EN['Veja <b>isto</b>.'] = 'See <b>this</b>.';
    setLocale('en');
    render(<p aria-label="z">{rich('Veja <b>isto</b>.')}</p>);
    expect(screen.getByLabelText('z')).toHaveTextContent('See this.');
    expect(screen.getByLabelText('z').querySelector('b')).toHaveTextContent('this');
    delete EN['Veja <b>isto</b>.'];
  });
});

describe('t em inglês', () => {
  it('usa o dicionário, cai no português quando falta e preenche parâmetros', () => {
    EN['Teste {x}'] = 'Test {x}';
    setLocale('en');
    expect(t('Teste {x}', { x: 1 })).toBe('Test 1');
    expect(t('Sem tradução')).toBe('Sem tradução');
    delete EN['Teste {x}'];
  });

  it('traduz mensagens do host que já chegam preenchidas, pelo molde com {parâmetro}', () => {
    EN['O card {title} não existe em {where}.'] = 'Card {title} does not exist in {where}.';
    setLocale('en');
    expect(t('O card Login não existe em Backlog.')).toBe('Card Login does not exist in Backlog.');
    delete EN['O card {title} não existe em {where}.'];
  });

  it('plural em inglês', () => {
    EN['{n} sub-tarefa'] = '{n} sub-task';
    EN['{n} sub-tarefas'] = '{n} sub-tasks';
    setLocale('en');
    expect(tn(1, '{n} sub-tarefa', '{n} sub-tarefas')).toBe('1 sub-task');
    expect(tn(2, '{n} sub-tarefa', '{n} sub-tarefas')).toBe('2 sub-tasks');
    delete EN['{n} sub-tarefa'];
    delete EN['{n} sub-tarefas'];
  });
});

describe('resolveLocale', () => {
  it('automático segue o idioma do sistema: inglês para en*, português para o resto', () => {
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'en')).toBe('en');
    expect(resolveLocale('auto', 'pt-BR')).toBe('pt-BR');
    expect(resolveLocale('auto', 'fr-FR')).toBe('pt-BR');
    expect(resolveLocale('pt-BR', 'en-US')).toBe('pt-BR');
    expect(resolveLocale('en', 'pt-BR')).toBe('en');
  });
});
