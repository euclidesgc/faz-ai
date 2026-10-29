import { lastSent, posted, renderThemed, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { CardCommits } from '../../src/webview/components/card/CardCommits';
import type { StoryCommit } from '../../src/shared/commits';
import type { HostToWebview } from '../../src/shared/messages';

beforeEach(() => posted.mockClear());

const commit = (hash: string, phase: string, over: Partial<StoryCommit> = {}): StoryCommit => ({
  hash,
  subject: `assunto ${hash}`,
  date: '2026-10-29T10:00:00Z',
  card: '1189',
  phase,
  run: '0123456789abcdef',
  ...over,
});

function reply(commits?: StoryCommit[], error?: string, requestId = lastSent('card.commits.query').requestId) {
  const msg: HostToWebview = { type: 'card.commits.result', requestId, commits, error };
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

describe('CardCommits', () => {
  it('mostra um grupo por fase, com "Sem fase" por último', () => {
    renderThemed(<CardCommits cardId="c1" branch="feature/1-x" />);
    reply([commit('aaa1111', ''), commit('bbb2222', 'Plan'), commit('ccc3333', 'Spec')]);
    const heads = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(heads).toEqual(['Spec', 'Plan', 'Sem fase']);
    expect(screen.getByText('assunto bbb2222')).toBeInTheDocument();
    expect(screen.getAllByText(/01234567(?!8)/).length).toBeGreaterThan(0);
  });

  it('não renderiza nada sem commits, com erro ou sem branch', () => {
    const { container, unmount } = renderThemed(<CardCommits cardId="c1" branch="feature/1-x" />);
    expect(container.querySelector('.card-commits')).toBeNull(); // carregando
    reply([]);
    expect(container.querySelector('.card-commits')).toBeNull();
    reply(undefined, 'falhou');
    expect(container.querySelector('.card-commits')).toBeNull();
    unmount();
    posted.mockClear();
    const semBranch = renderThemed(<CardCommits cardId="c1" branch={null} />);
    expect(sentOf('card.commits.query')).toHaveLength(0);
    expect(semBranch.container.querySelector('.card-commits')).toBeNull();
  });

  it('descarta resposta de outro requestId', () => {
    const { container } = renderThemed(<CardCommits cardId="c1" branch="feature/1-x" />);
    reply([commit('aaa1111', 'Plan')], undefined, 'outro');
    expect(container.querySelector('.card-commits')).toBeNull();
  });
});
