import { RadioGroup } from '@radix-ui/themes';
import { AI_BASES, type AiTool } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { settings } from '../../../commands';
import { useAction } from '../../../useAction';
import { SectionHeader } from '../SectionHeader';
import { BoardInstall } from './BoardInstall';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';

/** Escolha da ferramenta de IA do projeto (uma por vez). */
export function ProjectTool({ tool }: { tool: AiToolInfo }) {
  // trocar a ferramenta relê o harness e confere a CLI nova: a tabela mostra a espera até o host confirmar
  const inventory = useBoardStore((s) => s.state!.harness.inventory.find((x) => x.tool === tool.id)?.items ?? []);
  const change = useAction((id: AiTool) => settings.updateBoard({ aiTool: id }));
  const chooseTool = (id: AiTool) => id !== tool.id && void change.run(id);
  return (
    <>
      <SectionHeader id="harness-tool" title={t('Ferramenta deste projeto')}>
        {t(
          'A ferramenta selecionada define a execução e os modelos dos cards. Regras, skills, subagentes e MCPs são gerenciados na biblioteca do board, compartilhada entre as ferramentas.',
        )}
      </SectionHeader>
      {change.busy && (
        <p role="status" className="muted small">
          <span className="spinner" aria-hidden /> {t('Trocando a ferramenta e relendo o harness…')}
        </p>
      )}
      <RadioGroup.Root
        value={tool.id}
        disabled={change.busy}
        onValueChange={(id) => chooseTool(id as AiTool)}
        aria-label={t('Ferramenta de IA do projeto')}
      >
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t('Ferramenta')}</th>
            </tr>
          </thead>
          <tbody>
            {AI_BASES.map((x) => (
              <tr key={x.id} className={x.id === tool.id ? '' : 'off'}>
                <td>
                  <RadioGroup.Item value={x.id} aria-label={x.label} />
                </td>
                <td>{x.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RadioGroup.Root>
      <BoardInstall artifact="mcp" tool={tool.id} items={inventory} />
    </>
  );
}
