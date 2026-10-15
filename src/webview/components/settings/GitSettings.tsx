import { DEFAULT_GIT, MERGE_METHODS, WORKSPACE_MODES, branchName, type GitConfig } from '../../../shared/git';
import { flowPrefix } from '../../../shared/gitflow';
import { useBoardStore } from '../../store/boardStore';
import { settings, ui } from '../../commands';
import { isWeb } from '../../vscode';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';
import { Button, Callout, Card, TextField } from '@radix-ui/themes';
import { FormField, IconWarning, SelectField, SwitchField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { PageHeader } from './PageHeader';
import { GitFlowSection } from './GitFlowSection';
import { OrphansSection } from './OrphansSection';

export function GitSettings() {
  const state = useBoardStore((s) => s.state)!;
  const git = state.board.git;
  const set = (patch: Partial<GitConfig>) => settings.updateBoard({ git: patch });
  const off = git.mode === 'off';
  // o exemplo usa o prefixo de uma história de verdade: o do tipo de branch do tipo História
  const story = state.cardTypes.find((ct) => ct.name === 'História');
  const exemplo = branchName(git.branchPattern, {
    type: t('História'),
    number: 12,
    title: t('Login com Google'),
    flow: flowPrefix(git, story?.branchKind ?? 'feature', t('História')),
  });

  return (
    <div>
      <PageHeader title="Git">
        {rich(
          'Cada história trabalha numa branch própria, criada pelo board com um nome previsível. As sub-tarefas fazem commits na branch da história. A branch é criada quando a IA chama <code>prepare_workspace</code> (a fase de Implementação padrão pede isso) ou pelo botão no card.',
        )}
      </PageHeader>

      <GitFlowSection />

      {!isWeb && (
        <Card className="form-card">
          <p>{t('O Git agora fica no Settings do editor.')}</p>
          <Button variant="soft" onClick={() => ui.openIdeSettings('fazai.git.mode')}>
            {t('Abrir no Settings do editor')}
          </Button>
        </Card>
      )}

      {/* fora do `isWeb`: a limpeza vale no editor também */}
      <OrphansSection />

      {isWeb && (
        <>
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
                'Aceita <code>{fluxo}</code> (o prefixo do tipo de branch), <code>{tipo}</code>, <code>{numero}</code> (obrigatório) e <code>{titulo}</code>. Exemplo: <code>{exemplo}</code>',
                { exemplo },
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
              'Na Homologação a IA abre o pull request da história e o registra no card. Com o merge automático ligado, quando você aprova uma história que está na última coluna antes da conclusão, o board faz o merge do PR e só então conclui o card. Se o merge falhar (conflito, checks obrigatórios, sem acesso), o card fica Bloqueado com o erro. O merge feito fora do board também conclui a história: a cada rodada do heartbeat, o board confere o pull request das histórias entregues.',
            )}
          </SectionHeader>
          <Card className="form-card" aria-label={t('Pull request e merge')}>
            <SwitchField
              label={t('Fazer o merge do PR ao aprovar a homologação')}
              checked={git.autoMerge}
              onChange={(autoMerge) => set({ autoMerge })}
            />
            {git.autoMerge && (
              <Callout.Root color="amber" size="1">
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
            <FormField
              label={t('Registros de decisão')}
              hint={rich(
                'Pasta do repositório onde a Homologação grava o registro de decisão de cada história (ex.: <code>docs/decisoes</code>), a partir da Spec aprovada, e o leva no pull request. Vazio = desligado.',
              )}
            >
              {(id) => (
                <TextField.Root
                  id={id}
                  key={git.decisionRecords}
                  placeholder="docs/decisoes"
                  defaultValue={git.decisionRecords}
                  onBlur={(e) => e.target.value.trim() !== git.decisionRecords && set({ decisionRecords: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              )}
            </FormField>
          </Card>
        </>
      )}
    </div>
  );
}
