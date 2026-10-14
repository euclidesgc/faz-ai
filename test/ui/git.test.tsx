import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';

// liga o modo navegador antes de o setup montar o mock de `src/webview/vscode` (padrão de appearanceSettingsWeb.test.tsx):
// no editor (!isWeb, padrão dos testes), o GitSettings mostra só o link para o Settings (ver gitSettingsEditor.test.tsx)
vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
import { WORKSPACE_MODES } from '../../src/shared/git';
import type { MainBranch } from '../../src/shared/git';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

/** O snapshot com a principal detectada (quem a detecta é o host, que o teste não tem). */
const withMain = (main: MainBranch | null = { name: 'main', source: 'origin' }) =>
  useBoardStore.setState({ state: { ...board.router.snapshot(), mainBranch: main } });
const setGit = (git: Record<string, unknown>) => {
  board.router.handle({ type: 'settings.board.update', patch: { git } });
  withMain();
};
const table = () => screen.getByRole('table', { name: 'Branches do gitflow' });
const rowOf = (branch: string) =>
  within(table())
    .getAllByRole('row')
    .find((r) => r.querySelector('td code')?.textContent === branch)!;

const show = () =>
  render(
    <Theme>
      <GitSettings />
    </Theme>,
  );

describe('GitSettings', () => {
  it('o modo de trabalho grava o escolhido', async () => {
    show();
    const mode = WORKSPACE_MODES.find((m) => m.value === 'branch')!;
    await choose(screen.getByRole('combobox', { name: 'Onde a IA mexe no código' }), mode.label);
    expect(lastSent('settings.board.update').patch).toEqual({ git: { mode: 'branch' } });
  });

  it('explica o paralelismo de histórias conforme o modo: disponível no worktree, uma por vez nos outros', () => {
    const note = () => screen.getByRole('note', { name: 'Histórias em paralelo' });
    const first = show();
    expect(note()).toHaveTextContent('disponíveis neste modo');
    expect(note()).toHaveTextContent('mais uma cópia dos arquivos do projeto em disco');
    first.unmount();
    board.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    syncStore(board.router);
    const second = show();
    expect(note()).toHaveTextContent('trata uma história por vez');
    expect(note()).toHaveTextContent('causando conflitos');
    second.unmount();
    board.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    syncStore(board.router);
  });

  it('o nome da branch grava ao sair do campo, não a cada tecla', async () => {
    show();
    const name = screen.getByLabelText('Nome da branch');
    await userEvent.clear(name);
    await userEvent.type(name, 'feat/{{numero}');
    expect(sentOf('settings.board.update')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch).toEqual({ git: { branchPattern: 'feat/{numero}' } });
  });

  it('o merge automático liga com aviso, e só então o tipo de merge fica disponível', async () => {
    show();
    const method = screen.getByRole('combobox', { name: 'Tipo de merge' });
    expect(method).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Fazer o merge do PR ao aprovar a homologação' }));
    expect(lastSent('settings.board.update').patch).toEqual({ git: { autoMerge: true } });
  });

  it('explica que a detecção de merges acontece nas rodadas do heartbeat, sem opção própria', () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Concluir a história quando o pull request for mergeado' })).toBeNull();
    expect(screen.queryByLabelText('Verificar a cada (minutos)')).toBeNull();
    expect(screen.getByText(/a cada rodada do heartbeat/)).toBeInTheDocument();
  });

  describe('gitflow', () => {
    afterEach(() =>
      setGit({ mode: 'worktree', gitflow: true, developBranch: 'develop', featurePrefix: 'feature/', hotfixPrefix: 'hotfix/' }),
    );

    it('mostra a principal detectada com a origem dela, e pede para detectar de novo ao abrir', () => {
      withMain({ name: 'trunk', source: 'origin' });
      const first = show();
      expect(screen.getByText(/Principal:/)).toHaveTextContent('Principal: trunk (branch padrão do origin)');
      expect(lastSent('git.main.refresh')).toEqual({ type: 'git.main.refresh' });
      first.unmount();
      withMain({ name: 'master', source: 'name' });
      const second = show();
      expect(screen.getByText(/Principal:/)).toHaveTextContent('Principal: master (nome local)');
      second.unmount();
      withMain({ name: 'wip', source: 'current' });
      show();
      expect(screen.getByText(/Principal:/)).toHaveTextContent('Principal: wip (branch atual)');
    });

    it('a tabela traz as branches com os nomes configurados, de onde partem e para onde vai o PR', () => {
      setGit({ developBranch: 'dev', hotfixPrefix: 'fix/' });
      show();
      expect(
        within(rowOf('main'))
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ).toEqual(['main', 'branch principal do repositório', '—', '—']);
      expect(
        within(rowOf('dev'))
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ).toEqual(['dev', 'branch de integração', 'main', '—']);
      const feature = within(rowOf('feature/')).getAllByRole('cell');
      expect(feature[1]).toHaveTextContent('História');
      expect([feature[2]!.textContent, feature[3]!.textContent]).toEqual(['dev', 'dev']);
      expect(within(rowOf('bugfix/')).getAllByRole('cell')[1]).toHaveTextContent('Retrabalho');
      const hotfix = within(rowOf('fix/')).getAllByRole('cell');
      expect(hotfix[1]).toHaveTextContent('Bug');
      expect([hotfix[2]!.textContent, hotfix[3]!.textContent]).toEqual(['main', 'main']);
      const release = within(rowOf('release/')).getAllByRole('cell');
      expect(release[1]).toHaveTextContent('processo de release do projeto');
      expect([release[2]!.textContent, release[3]!.textContent]).toEqual(['dev', 'main']);
    });

    it('trocar o prefixo de feature muda a tabela', () => {
      setGit({ featurePrefix: 'feat/' });
      show();
      expect(within(table()).getByText('feat/')).toBeInTheDocument();
      expect(within(table()).queryByText('feature/')).toBeNull();
    });

    it('explica quando usar Retrabalho e quando usar Bug', () => {
      show();
      expect(screen.getByRole('note', { name: 'Quando usar Retrabalho' })).toHaveTextContent('Retrabalho (bugfix), não Bug (hotfix)');
    });

    it('os campos gravam ao sair do campo, e o vazio já mostra o padrão', async () => {
      show();
      await userEvent.click(screen.getByRole('switch', { name: 'Usar o gitflow' }));
      expect(lastSent('settings.board.update').patch).toEqual({ git: { gitflow: false } });
      const develop = screen.getByLabelText('Branch de integração');
      await userEvent.clear(develop);
      await userEvent.type(develop, 'integracao');
      expect(sentOf('settings.board.update')).toHaveLength(1);
      await userEvent.tab();
      expect(lastSent('settings.board.update').patch).toEqual({ git: { developBranch: 'integracao' } });
      const hotfix = screen.getByLabelText('Prefixo de hotfix');
      await userEvent.clear(hotfix);
      await userEvent.tab();
      expect(lastSent('settings.board.update').patch).toEqual({ git: { developBranch: 'integracao' } });
      expect(hotfix).toHaveValue('hotfix/');
    });

    it('com o gitflow desligado a tabela some, a frase da principal aparece e os campos ficam desabilitados', () => {
      setGit({ gitflow: false });
      show();
      expect(screen.queryByRole('table', { name: 'Branches do gitflow' })).toBeNull();
      expect(screen.queryByRole('note', { name: 'Quando usar Retrabalho' })).toBeNull();
      expect(screen.getByText(/As branches saem da principal/)).toHaveTextContent(
        'As branches saem da principal (main) e os pull requests vão para ela.',
      );
      for (const name of ['Branch de integração', 'Prefixo de feature', 'Prefixo de bugfix', 'Prefixo de hotfix', 'Prefixo de release'])
        expect(screen.getByLabelText(name)).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Tipo de branch de História' })).toBeDisabled();
      // o interruptor continua livre: é por ele que se volta ao gitflow
      expect(screen.getByRole('switch', { name: 'Usar o gitflow' })).toBeEnabled();
    });

    it('no modo "Desligado" os campos, o interruptor e os tipos de branch ficam desabilitados', () => {
      setGit({ mode: 'off' });
      show();
      expect(screen.getByRole('switch', { name: 'Usar o gitflow' })).toBeDisabled();
      expect(screen.getByLabelText('Prefixo de feature')).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Tipo de branch de Bug' })).toBeDisabled();
    });

    it('o tipo de branch de um tipo de card é um select que manda settings.type.update com branchKind', async () => {
      show();
      const typeId = board.router.snapshot().cardTypes.find((ct) => ct.name === 'Débito técnico')!.id;
      const select = screen.getByRole('combobox', { name: 'Tipo de branch de Débito técnico' });
      expect(select).toHaveTextContent('Feature');
      await choose(select, 'Hotfix');
      expect(lastSent('settings.type.update')).toEqual({ type: 'settings.type.update', typeId, patch: { branchKind: 'hotfix' } });
    });

    it('o select mostra feature, bugfix e hotfix, nunca release, e só os tipos das histórias', async () => {
      show();
      expect(screen.getByRole('combobox', { name: 'Tipo de branch de Bug' })).toHaveTextContent('Hotfix');
      expect(screen.getByRole('combobox', { name: 'Tipo de branch de Retrabalho' })).toHaveTextContent('Bugfix');
      expect(screen.queryByRole('combobox', { name: /Tipo de branch de Sub-tarefa/ })).toBeNull();
      await userEvent.click(screen.getByRole('combobox', { name: 'Tipo de branch de História' }));
      expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Feature', 'Bugfix', 'Hotfix']);
    });
  });
});
