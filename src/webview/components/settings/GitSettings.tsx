import { DEFAULT_GIT, MERGE_METHODS, WORKSPACE_MODES, branchName, type GitConfig } from '../../../shared/git';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { Callout, Card, TextField } from '@radix-ui/themes';
import { FormField, IconWarning, SelectField, SwitchField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { PageHeader } from './PageHeader';

export function GitSettings() {
  const git = useBoardStore((s) => s.state)!.board.git;
  const set = (patch: Partial<GitConfig>) => settings.updateBoard({ git: patch });
  const off = git.mode === 'off';

  return (
    <div>
      <PageHeader title="Git">
        Cada história trabalha numa branch própria, criada pelo board com um nome previsível. As sub-tarefas fazem commits na branch da
        história. A branch é criada quando a IA chama <code>prepare_workspace</code> (a fase de Implementação padrão pede isso) ou pelo
        botão no card.
      </PageHeader>

      <Card className="form-card" aria-label="Branch e worktree">
        <FormField label="Onde a IA mexe no código" hint={WORKSPACE_MODES.find((m) => m.value === git.mode)!.hint}>
          {(id) => (
            <SelectField
              id={id}
              aria-label="Onde a IA mexe no código"
              options={WORKSPACE_MODES}
              value={git.mode}
              onChange={(mode) => set({ mode })}
            />
          )}
        </FormField>

        <FormField
          label="Nome da branch"
          hint={
            <>
              Aceita <code>{'{tipo}'}</code>, <code>{'{numero}'}</code> (obrigatório) e <code>{'{titulo}'}</code>. Exemplo:{' '}
              <code>{branchName(git.branchPattern, { type: 'História', number: 12, title: 'Login com Google' })}</code>
            </>
          }
        >
          {(id) => (
            <TextField.Root
              id={id}
              key={git.branchPattern}
              disabled={off}
              defaultValue={git.branchPattern}
              onBlur={(e) => e.target.value.trim() !== git.branchPattern && set({ branchPattern: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}
        </FormField>

        <FormField
          label="Pasta das worktrees"
          hint={
            <>
              Relativa à pasta do projeto; <code>{'{repo}'}</code> é o nome dela. O padrão (<code>{DEFAULT_GIT.worktreeDir}</code>) fica ao
              lado do projeto, fora do repositório. Cada worktree é uma cópia de trabalho: dependências (ex.: <code>node_modules</code>)
              precisam ser instaladas nela.
            </>
          }
        >
          {(id) => (
            <TextField.Root
              id={id}
              key={git.worktreeDir}
              disabled={git.mode !== 'worktree'}
              defaultValue={git.worktreeDir}
              onBlur={(e) => e.target.value.trim() !== git.worktreeDir && set({ worktreeDir: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}
        </FormField>
      </Card>

      <SectionHeader title="Pull request e merge">
        Na Homologação a IA abre o pull request da história e o registra no card. Com o merge automático ligado, quando você aprova uma
        história que está na última coluna antes da conclusão, o board faz o merge do PR e só então conclui o card. Se o merge falhar
        (conflito, checks obrigatórios, sem acesso), o card fica Bloqueado com o erro.
      </SectionHeader>
      <Card className="form-card" aria-label="Pull request e merge">
        <SwitchField
          label="Fazer o merge do PR ao aprovar a homologação"
          checked={git.autoMerge}
          onChange={(autoMerge) => set({ autoMerge })}
        />
        {git.autoMerge && (
          <Callout.Root color="orange" size="1">
            <Callout.Icon>
              <IconWarning />
            </Callout.Icon>
            <Callout.Text>
              O merge é feito no GitHub com a sua conta (comando <code>gh</code>) e não pode ser desfeito pelo board.
            </Callout.Text>
          </Callout.Root>
        )}
        <FormField
          label="Tipo de merge"
          hint={
            <>
              Requer o GitHub CLI (<code>gh</code>) instalado e autenticado. No modo worktree, a pasta de trabalho da história é removida
              depois do merge; a branch fica.
            </>
          }
        >
          {(id) => (
            <SelectField
              id={id}
              aria-label="Tipo de merge"
              options={MERGE_METHODS}
              disabled={!git.autoMerge}
              value={git.mergeMethod}
              onChange={(mergeMethod) => set({ mergeMethod })}
            />
          )}
        </FormField>
      </Card>
    </div>
  );
}
