import { useEffect } from 'react';
import {
  BRANCH_KINDS,
  cleanBranchName,
  cleanPrefix,
  DEFAULT_GIT,
  type BranchKind,
  type GitConfig,
  type MainBranch,
} from '../../../shared/git';
import { flowRows, type FlowRow } from '../../../shared/gitflow';
import { badgeStyle } from '../../../shared/color';
import { useBoardStore } from '../../store/boardStore';
import { settings, ui } from '../../commands';
import { isWeb } from '../../vscode';
import { t, dt } from '../../i18n';
import { rich } from '../../i18n/rich';
import { Button, Card, TextField } from '@radix-ui/themes';
import { FormField, SelectField, SwitchField } from '../ui';
import { SectionHeader } from './SectionHeader';

/** De onde veio a principal detectada, como a tela diz. */
const MAIN_SOURCE: Record<MainBranch['source'], string> = {
  origin: 'branch padrão do origin',
  name: 'nome local',
  current: 'branch atual',
};

/** Os prefixos e a branch de integração, com o rótulo e a chave do Settings. */
type NameKey = 'developBranch' | 'featurePrefix' | 'bugfixPrefix' | 'hotfixPrefix' | 'releasePrefix';

const NAME_FIELDS: { key: NameKey; label: string }[] = [
  { key: 'developBranch', label: 'Branch de integração' },
  { key: 'featurePrefix', label: 'Prefixo de feature' },
  { key: 'bugfixPrefix', label: 'Prefixo de bugfix' },
  { key: 'hotfixPrefix', label: 'Prefixo de hotfix' },
  { key: 'releasePrefix', label: 'Prefixo de release' },
];

/** O que cada linha da tabela diz na coluna "Gerada por": os tipos de card, ou a explicação de quem não vem de card. */
function createdBy(row: FlowRow): string {
  if (row.kind === 'main') return t('branch principal do repositório');
  if (row.kind === 'develop') return t('branch de integração');
  if (row.kind === 'release') return t('processo de release do projeto');
  return row.types.length ? row.types.map(dt).join(', ') : t('nenhum tipo de card');
}

/**
 * Seção "Gitflow" da tela Git (#462): a principal detectada, a tabela das branches, o quando usar Retrabalho,
 * os campos (no navegador; no editor o Settings é a fonte) e o tipo de branch de cada tipo de card.
 */
export function GitFlowSection() {
  const state = useBoardStore((s) => s.state)!;
  const git = state.board.git;
  const main = state.mainBranch;
  const off = git.mode === 'off';
  const mainName = main?.name ?? t('principal');
  const set = (patch: Partial<GitConfig>) => settings.updateBoard({ git: patch });
  // um campo de nome por vez; o objeto tipado pela chave dispensa o cast de `{ [key]: value }`, que o TS alarga para string
  const setName = (key: NameKey, value: string) => {
    const patch: Partial<Pick<GitConfig, NameKey>> = {};
    patch[key] = value;
    set(patch);
  };

  // a principal é detectada de novo ao abrir a tela: o repositório pode ter mudado desde a abertura do board
  useEffect(() => {
    ui.refreshMainBranch();
  }, []);

  const parentWorkflows = new Set(state.workflows.filter((w) => w.kind === 'parent').map((w) => w.id));
  const storyTypes = state.cardTypes.filter((ct) => parentWorkflows.has(ct.defaultWorkflowId));
  // só os tipos das histórias geram branch: a sub-tarefa trabalha na branch da história dela
  const rows = flowRows(git, storyTypes, mainName);

  return (
    <>
      <SectionHeader title="Gitflow">
        {t(
          'Com o gitflow, funcionalidades e correções partem da branch de integração (develop) e voltam para ela; só o hotfix parte da principal. O prefixo da branch mostra o tipo de trabalho.',
        )}
      </SectionHeader>
      <Card className="form-card" aria-label="Gitflow">
        <p className="muted small">
          {main
            ? rich('Principal: <code>{name}</code> ({origin})', { name: main.name, origin: t(MAIN_SOURCE[main.source]) })
            : t('Principal: não detectada (esta pasta não é um repositório git).')}
        </p>

        {git.gitflow ? (
          <>
            <table className="table" aria-label={t('Branches do gitflow')}>
              <thead>
                <tr>
                  <th>{t('Branch')}</th>
                  <th>{t('Gerada por')}</th>
                  <th>{t('Parte de')}</th>
                  <th>{t('PR para')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.kind}>
                    <td>
                      <code>{row.branch}</code>
                    </td>
                    <td>{createdBy(row)}</td>
                    <td>{row.from ? <code>{row.from}</code> : '—'}</td>
                    <td>{row.prTo ? <code>{row.prTo}</code> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small" role="note" aria-label={t('Quando usar Retrabalho')}>
              {rich(
                '<b>Quando usar Retrabalho:</b> um defeito numa funcionalidade que ainda só está na <code>{develop}</code> é Retrabalho (bugfix), não Bug (hotfix). Bug é o defeito que já está na principal (<code>{main}</code>) e precisa de correção urgente.',
                { develop: git.developBranch, main: mainName },
              )}
            </p>
          </>
        ) : (
          <p>{rich('As branches saem da principal (<code>{main}</code>) e os pull requests vão para ela.', { main: mainName })}</p>
        )}

        {isWeb ? (
          <>
            <SwitchField label={t('Usar o gitflow')} checked={git.gitflow} disabled={off} onChange={(gitflow) => set({ gitflow })} />
            {NAME_FIELDS.map((f) => (
              <FormField
                key={f.key}
                label={t(f.label)}
                hint={
                  f.key === 'developBranch'
                    ? undefined
                    : rich('Vazio volta ao padrão (<code>{padrao}</code>).', { padrao: DEFAULT_GIT[f.key] })
                }
              >
                {(id) => (
                  <TextField.Root
                    id={id}
                    key={git[f.key]}
                    disabled={off || !git.gitflow}
                    defaultValue={git[f.key]}
                    onBlur={(e) => {
                      // o board troca o vazio e o inválido pelo padrão; o campo mostra já o que vai valer
                      const clean =
                        f.key === 'developBranch'
                          ? cleanBranchName(e.target.value, DEFAULT_GIT[f.key])
                          : cleanPrefix(e.target.value, DEFAULT_GIT[f.key]);
                      e.target.value = clean;
                      if (clean !== git[f.key]) setName(f.key, clean);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                )}
              </FormField>
            ))}
          </>
        ) : (
          <>
            <ul className="muted small" aria-label={t('Valores no Settings do editor')}>
              <li>
                {t('Usar o gitflow')}: {git.gitflow ? t('sim') : t('não')}
              </li>
              {NAME_FIELDS.map((f) => (
                <li key={f.key}>
                  {t(f.label)}: <code>{git[f.key]}</code>
                </li>
              ))}
            </ul>
            <div className="row">
              <Button variant="soft" onClick={() => ui.openIdeSettings('fazai.git.gitflow')}>
                {t('Abrir o gitflow no Settings do editor')}
              </Button>
            </div>
          </>
        )}
      </Card>

      <SectionHeader title={t('Tipo de branch por tipo de card')}>
        {t(
          'Cada tipo de card das histórias gera um tipo de branch. A escolha fica no tipo: renomear o tipo não muda a branch. A release não sai de um tipo de card; é o processo de release do projeto.',
        )}
      </SectionHeader>
      <Card className="form-card" aria-label={t('Tipo de branch por tipo de card')}>
        {storyTypes.map((ct) => (
          <div className="row" key={ct.id}>
            <span className="type-badge" style={badgeStyle(ct.color)}>
              {dt(ct.name)}
            </span>
            <SelectField<BranchKind>
              aria-label={t('Tipo de branch de {name}', { name: dt(ct.name) })}
              options={BRANCH_KINDS.map((k) => ({ value: k.value, label: t(k.label) }))}
              value={ct.branchKind}
              disabled={off || !git.gitflow}
              onChange={(branchKind) => settings.updateType(ct.id, { branchKind })}
            />
          </div>
        ))}
      </Card>
    </>
  );
}
