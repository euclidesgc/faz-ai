import { DEFAULT_GIT, WORKSPACE_MODES, branchName, type GitConfig, type WorkspaceMode } from '../../../shared/git';
import { useBoardStore } from '../../store/boardStore';

export function GitSettings() {
  const git = useBoardStore((s) => s.state)!.board.git;
  const send = useBoardStore((s) => s.send);
  const set = (patch: Partial<GitConfig>) => send({ type: 'settings.board.update', patch: { git: patch } });
  const off = git.mode === 'off';

  return (
    <div>
      <h2>Git</h2>
      <p className="muted">
        Cada história trabalha numa branch própria, criada pelo board com um nome previsível. As sub-tarefas fazem commits na branch da história.
        A branch é criada quando a IA chama <code>prepare_workspace</code> (a fase de Implementação padrão pede isso) ou pelo botão no card.
      </p>

      <section className="settings-block">
        <label className="field-row">
          <span>Onde a IA mexe no código</span>
          <select value={git.mode} onChange={(e) => set({ mode: e.target.value as WorkspaceMode })}>
            {WORKSPACE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <p className="muted small">{WORKSPACE_MODES.find((m) => m.value === git.mode)!.hint}</p>

        <label className="field-row">
          <span>Nome da branch</span>
          <input key={git.branchPattern} disabled={off} defaultValue={git.branchPattern} onBlur={(e) => e.target.value.trim() !== git.branchPattern && set({ branchPattern: e.target.value })} />
        </label>
        <p className="muted small">
          Aceita <code>{'{tipo}'}</code>, <code>{'{numero}'}</code> (obrigatório) e <code>{'{titulo}'}</code>. Exemplo:{' '}
          <code>{branchName(git.branchPattern, { type: 'História', number: 12, title: 'Login com Google' })}</code>
        </p>

        <label className="field-row">
          <span>Pasta das worktrees</span>
          <input key={git.worktreeDir} disabled={git.mode !== 'worktree'} defaultValue={git.worktreeDir} onBlur={(e) => e.target.value.trim() !== git.worktreeDir && set({ worktreeDir: e.target.value })} />
        </label>
        <p className="muted small">
          Relativa à pasta do projeto; <code>{'{repo}'}</code> é o nome dela. O padrão (<code>{DEFAULT_GIT.worktreeDir}</code>) fica ao lado do projeto, fora do repositório.
          Cada worktree é uma cópia de trabalho: dependências (ex.: <code>node_modules</code>) precisam ser instaladas nela.
        </p>
      </section>
    </div>
  );
}
