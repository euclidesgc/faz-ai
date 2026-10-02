import { DEFAULT_GIT, MERGE_METHODS, WORKSPACE_MODES, branchName, type GitConfig, type MergeMethod, type WorkspaceMode } from '../../../shared/git';
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

      <h3 className="section-head">Pull request e merge</h3>
      <p className="muted">
        Na Homologação a IA abre o pull request da história e o registra no card. Com o merge automático ligado, quando você aprova uma história
        que está na última coluna antes da conclusão, o board faz o merge do PR e só então conclui o card. Se o merge falhar (conflito, checks
        obrigatórios, sem acesso), o card fica Bloqueado com o erro.
      </p>
      <section className="settings-block">
        <label className="switch">
          <input type="checkbox" checked={git.autoMerge} onChange={(e) => set({ autoMerge: e.target.checked })} />
          Fazer o merge do PR ao aprovar a homologação
        </label>
        {git.autoMerge && <p className="banner warn small">O merge é feito no GitHub com a sua conta (comando <code>gh</code>) e não pode ser desfeito pelo board.</p>}
        <label className="field-row">
          <span>Tipo de merge</span>
          <select disabled={!git.autoMerge} value={git.mergeMethod} onChange={(e) => set({ mergeMethod: e.target.value as MergeMethod })}>
            {MERGE_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <p className="muted small">Requer o GitHub CLI (<code>gh</code>) instalado e autenticado. No modo worktree, a pasta de trabalho da história é removida depois do merge; a branch fica.</p>
      </section>
    </div>
  );
}
