import { DEFAULT_GIT, MERGE_METHODS, MERGE_WATCH_RANGE, WORKSPACE_MODES, branchName, type GitConfig } from '../../../shared/git';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';
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
        {rich(
          'Cada história trabalha numa branch própria, criada pelo board com um nome previsível. As sub-tarefas fazem commits na branch da história. A branch é criada quando a IA chama <code>prepare_workspace</code> (a fase de Implementação padrão pede isso) ou pelo botão no card.',
        )}
      </PageHeader>

      <Card className="form-card" aria-label="Branch e worktree">
        <FormField label={t('Onde a IA mexe no código')} hint={t(WORKSPACE_MODES.find((m) => m.value === git.mode)!.hint)}>
          {(id) => (
            <SelectField
              id={id}
              aria-label={t('Onde a IA mexe no código')}
              options={WORKSPACE_MODES.map((m) => ({ value: m.value, label: t(m.label) }))}
              value={git.mode}
              onChange={(mode) => set({ mode })}
            />
          )}
        </FormField>
        <Callout.Root color={git.mode === 'worktree' ? 'blue' : 'orange'} size="1" role="note" aria-label={t('Histórias em paralelo')}>
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {git.mode === 'worktree'
              ? t(
                  'Histórias em paralelo: disponíveis neste modo. Cada história tem a sua pasta, então o heartbeat pode tocar várias ao mesmo tempo (ligue "Tocar histórias em paralelo", na execução pela IA). O custo: cada worktree é mais uma cópia dos arquivos do projeto em disco e precisa das próprias dependências instaladas; e cada história em paralelo é mais um processo de IA, com os testes e builds dela, usando memória e processador ao mesmo tempo.',
                )
              : git.mode === 'branch'
                ? t(
                    'Neste modo o board trata uma história por vez. Todas as histórias trabalham na mesma pasta: duas ao mesmo tempo trocariam a branch uma debaixo da outra e misturariam as alterações, causando conflitos e commits na branch errada. Para tocar histórias em paralelo, escolha "Worktree por história".',
                  )
                : t(
                    'Sem branches nem worktrees, o board trata uma história por vez: todas trabalham direto na pasta do projeto, e duas ao mesmo tempo misturariam as alterações. Para tocar histórias em paralelo, escolha "Worktree por história".',
                  )}
          </Callout.Text>
        </Callout.Root>

        <FormField
          label={t('Nome da branch')}
          hint={rich(
            'Aceita <code>{tipo}</code>, <code>{numero}</code> (obrigatório) e <code>{titulo}</code>. Exemplo: <code>{exemplo}</code>',
            {
              exemplo: branchName(git.branchPattern, { type: t('História'), number: 12, title: t('Login com Google') }),
            },
          )}
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
          label={t('Pasta das worktrees')}
          hint={rich(
            'Relativa à pasta do projeto; <code>{repo}</code> é o nome dela. O padrão (<code>{padrao}</code>) fica ao lado do projeto, fora do repositório. Cada worktree é uma cópia de trabalho: dependências (ex.: <code>node_modules</code>) precisam ser instaladas nela.',
            { padrao: DEFAULT_GIT.worktreeDir },
          )}
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

      <SectionHeader title={t('Pull request e merge')}>
        {t(
          'Na Homologação a IA abre o pull request da história e o registra no card. Com o merge automático ligado, quando você aprova uma história que está na última coluna antes da conclusão, o board faz o merge do PR e só então conclui o card. Se o merge falhar (conflito, checks obrigatórios, sem acesso), o card fica Bloqueado com o erro.',
        )}
      </SectionHeader>
      <Card className="form-card" aria-label={t('Pull request e merge')}>
        <SwitchField
          label={t('Fazer o merge do PR ao aprovar a homologação')}
          checked={git.autoMerge}
          onChange={(autoMerge) => set({ autoMerge })}
        />
        {git.autoMerge && (
          <Callout.Root color="orange" size="1">
            <Callout.Icon>
              <IconWarning />
            </Callout.Icon>
            <Callout.Text>
              {rich('O merge é feito no GitHub com a sua conta (comando <code>gh</code>) e não pode ser desfeito pelo board.')}
            </Callout.Text>
          </Callout.Root>
        )}
        <FormField
          label={t('Tipo de merge')}
          hint={rich(
            'Requer o GitHub CLI (<code>gh</code>) instalado e autenticado. No modo worktree, a pasta de trabalho da história é removida depois do merge; a branch fica.',
          )}
        >
          {(id) => (
            <SelectField
              id={id}
              aria-label={t('Tipo de merge')}
              options={MERGE_METHODS.map((m) => ({ ...m, label: t(m.label) }))}
              disabled={!git.autoMerge}
              value={git.mergeMethod}
              onChange={(mergeMethod) => set({ mergeMethod })}
            />
          )}
        </FormField>
        <SwitchField
          label={t('Concluir a história quando o pull request for mergeado')}
          checked={git.watchMerges}
          onChange={(watchMerges) => set({ watchMerges })}
        />
        {git.watchMerges && (
          <Callout.Root color="blue" size="1">
            <Callout.Icon>
              <IconWarning />
            </Callout.Icon>
            <Callout.Text>
              {t(
                'O board consulta o GitHub periodicamente para detectar quando o pull request foi mergeado e conclui a história automaticamente. Essa opção apenas lê o estado — o merge continua sendo feito por você.',
              )}
            </Callout.Text>
          </Callout.Root>
        )}
        <FormField
          label={t('Verificar a cada (minutos)')}
          hint={rich('Intervalo entre as verificações de merge no GitHub. Mínimo {min} minutos, máximo {max} minutos.', {
            min: MERGE_WATCH_RANGE.min,
            max: MERGE_WATCH_RANGE.max,
          })}
        >
          {(id) => (
            <TextField.Root
              id={id}
              key={git.watchMergeMinutes}
              disabled={!git.watchMerges}
              defaultValue={String(git.watchMergeMinutes)}
              onBlur={(e) => {
                const value = Math.round(Number(e.target.value));
                if (!Number.isFinite(value) || value < MERGE_WATCH_RANGE.min || value > MERGE_WATCH_RANGE.max) {
                  e.target.value = String(git.watchMergeMinutes);
                  return;
                }
                if (value !== git.watchMergeMinutes) {
                  set({ watchMergeMinutes: value });
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}
        </FormField>
      </Card>
    </div>
  );
}
