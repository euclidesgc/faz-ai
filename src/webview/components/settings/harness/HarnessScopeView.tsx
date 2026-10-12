import { useEffect, useState } from 'react';
import { Badge, Button, Callout, SegmentedControl } from '@radix-ui/themes';
import type { AiTool, InstallScope } from '../../../../shared/harness';
import { HARNESS_GROUPS, groupOf } from '../../../../shared/harnessCatalog';
import { missingSelections } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { IconWarning } from '../../ui';
import { SectionHeader } from '../SectionHeader';
import { HarnessGroupCard } from './HarnessGroupCard';
import { toolLabel } from './text';
import { useItemActions } from './useItemActions';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/** Em que aba fica uma marcação cujo arquivo sumiu: o caminho a partir de `~` ou absoluto é global. */
const scopeOfLocation = (location: string): InstallScope => (location.startsWith('~/') || location.startsWith('/') ? 'user' : 'project');

/**
 * Uma aba do Harness (Projeto ou Global): tudo que a ferramenta carrega naquele escopo, em grupos (regras
 * principais, regras por assunto, memória, skills, subagentes, comandos, hooks, servidores MCP,
 * configurações, estilos, plugins e organização). Abre na ferramenta do projeto; o seletor mostra a outra.
 * A memória automática do Claude Code fica na pasta do usuário, mas é deste projeto: aparece em Projeto.
 */
export function HarnessScopeView({ scope }: { scope: InstallScope }) {
  const state = useBoardStore((s) => s.state)!;
  const [tool, setTool] = useState<AiTool>(state.board.aiTool);
  const [open, setOpen] = useState<string | null>(null);
  // a pasta do usuário não é vigiada: relê ao abrir a tela
  useEffect(() => harness.refresh(), []);

  const inventory = state.harness.inventory;
  const all = inventory.find((x) => x.tool === tool)?.items ?? [];
  const actions = useItemActions(tool, all);
  const inTab = (i: (typeof all)[number]) => {
    const g = groupOf(tool, i);
    return scope === 'project' ? i.scope === 'project' || g === 'memory' : i.scope !== 'project' && g !== 'memory';
  };
  const shown = all.filter(inTab);
  const groups = HARNESS_GROUPS.filter((g) => (scope === 'project' ? g.id !== 'plugin' && g.id !== 'managed' : g.id !== 'memory'));
  const projectTool = tool === state.board.aiTool;
  const missing = projectTool ? missingSelections(state).filter((x) => scopeOfLocation(x.location) === scope) : [];

  return (
    <div className="scope-harness">
      <SectionHeader
        id={scope === 'project' ? 'harness-project' : 'harness-user'}
        title={scope === 'project' ? t('Harness do projeto') : t('Harness global')}
        actions={
          <Button variant="soft" color="gray" title={t('Relê as pastas do projeto e do usuário')} onClick={() => harness.refresh()}>
            {t('Reler pastas')}
          </Button>
        }
      >
        {scope === 'project'
          ? rich(
              'Tudo que a ferramenta de IA lê nesta pasta, por tipo: vai no repositório (menos os arquivos locais e a memória). Clique no caminho para abrir o arquivo aqui mesmo e editar. Nas rules e skills, escolha como as execuções do board usam cada uma; o que fica fora não existe para elas.',
            )
          : rich(
              'Tudo que a ferramenta de IA lê da sua pasta de usuário, dos plugins instalados e da sua organização: vale na sua máquina, em qualquer projeto. Clique no caminho para abrir o arquivo aqui mesmo e editar. A marcação das execuções é deste board.',
            )}
      </SectionHeader>
      <div className="row harness-tool-picker">
        <SegmentedControl.Root
          value={tool}
          onValueChange={(next) => {
            setTool(next as AiTool);
            setOpen(null);
          }}
          aria-label={t('Ferramenta de IA')}
        >
          {inventory.map((x) => (
            <SegmentedControl.Item key={x.tool} value={x.tool}>
              {toolLabel(x.tool)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        {projectTool ? (
          <Badge color="indigo" variant="soft">
            {t('ferramenta deste projeto')}
          </Badge>
        ) : (
          <span className="muted small">
            {t('Mostrando o que o {tool} carrega. As execuções do board usam o {board}: a marcação só vale para ele.', {
              tool: toolLabel(tool),
              board: toolLabel(state.board.aiTool),
            })}
          </span>
        )}
        {!inventory.find((x) => x.tool === tool)?.installed && (
          <Badge color="gray" variant="outline">
            {t('não encontrada nesta máquina')}
          </Badge>
        )}
      </div>
      {missing.length > 0 && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <Callout.Text>
            {t('Marcados para as execuções do board, mas o arquivo não existe mais:')}{' '}
            {missing.map((x) => (
              <span key={`${x.kind}:${x.location}`} className="harness-missing">
                <code>{x.location}</code>
                <Button variant="ghost" size="1" onClick={() => harness.setSelection([{ kind: x.kind, location: x.location }], null)}>
                  {t('Desmarcar')}
                </Button>
              </span>
            ))}
          </Callout.Text>
        </Callout.Root>
      )}
      {groups.map((g) => (
        <HarnessGroupCard
          key={`${tool}:${g.id}`}
          group={g}
          tool={tool}
          scope={scope}
          items={shown.filter((i) => groupOf(tool, i) === g.id)}
          all={all}
          actions={actions}
          open={open}
          onOpen={setOpen}
        />
      ))}
    </div>
  );
}
