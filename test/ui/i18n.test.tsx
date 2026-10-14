import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { EN } from '../../src/webview/i18n/en';
import { setLocale, t, tn } from '../../src/webview/i18n';
import { rich } from '../../src/webview/i18n/rich';
import { resolveLocale } from '../../src/shared/language';
import { BOARD_AUTHOR, gitNoticeText } from '../../src/shared/gitflow';
import { CommentsTab } from '../../src/webview/components/card/CommentsTab';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { seedBoard, syncStore } from './setup';

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

describe('i18n do gitflow na tela', () => {
  it('o aviso do board na conversa aparece em inglês, e o comentário de uma pessoa fica como foi escrito', async () => {
    const { router, storyId } = await seedBoard();
    const notice = gitNoticeText({ kind: 'developCreated', develop: 'develop', main: 'main' });
    router.handle({ type: 'comment.add', cardId: storyId, body: notice }, { author: BOARD_AUTHOR });
    router.handle({ type: 'comment.add', cardId: storyId, body: notice }, { author: 'Pessoa' });
    syncStore(router);
    setLocale('en');
    render(
      <Theme>
        <CommentsTab cardId={storyId} />
      </Theme>,
    );
    expect(screen.getAllByText('Branch develop did not exist: the board created it from main and pushed it to origin.')).toHaveLength(1);
    expect(screen.getAllByText(notice)).toHaveLength(1);
  });

  it('os outros comentários do board (autopiloto, runner) ficam como foram escritos, mesmo com " e " no texto', async () => {
    const { router, storyId } = await seedBoard();
    // o molde curto '{a} e {b}' do dicionário casaria com esta frase e trocaria o " e " do meio por " and "
    const autopilot =
      'O autopiloto parou: 3 execuções seguidas não avançaram a história. Veja a conversa e o log, destrave o card e retome.';
    router.handle({ type: 'comment.add', cardId: storyId, body: autopilot }, { author: BOARD_AUTHOR });
    syncStore(router);
    setLocale('en');
    render(
      <Theme>
        <CommentsTab cardId={storyId} />
      </Theme>,
    );
    expect(screen.getByText(autopilot)).toBeInTheDocument();
  });

  it('a seção do gitflow na tela Git sai em inglês', async () => {
    const { router } = await seedBoard();
    syncStore(router);
    useBoardStore.setState({ state: { ...router.snapshot(), mainBranch: { name: 'main', source: 'origin' } } });
    setLocale('en');
    render(
      <Theme>
        <GitSettings />
      </Theme>,
    );
    expect(screen.getByText(/^Main:/)).toHaveTextContent("Main: main (origin's default branch)");
    expect(screen.getByRole('table', { name: 'Gitflow branches' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'When to use Rework' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Branch kind of Rework' })).toBeInTheDocument();
    expect(screen.getByText("the project's release process")).toBeInTheDocument();
  });
});
