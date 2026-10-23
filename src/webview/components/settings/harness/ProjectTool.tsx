import { RadioGroup } from '@radix-ui/themes';
import { toolInfo, isReadyCli } from '../../../../shared/aiProfiles';
import type { AiTool } from '../../../../shared/harness';
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
  const profiles = useBoardStore((s) => s.state!.board.aiProfiles.filter((p) => p.enabled));
  const selected = profiles.find((p) => p.id === tool.id);
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
              <th>{t('Regras')}</th>
              <th>{t('Skills')}</th>
              <th>{t('MCP')}</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className={profile.id === tool.id ? '' : 'off'}>
                <td>
                  <RadioGroup.Item value={profile.id} aria-label={profile.name} />
                </td>
                <td>{profile.name}</td>
                <td>{toolInfo(profile).rules || '—'}</td>
                <td>{toolInfo(profile).skills || '—'}</td>
                <td>{toolInfo(profile).mcp || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RadioGroup.Root>
      {selected && isReadyCli(selected) && <BoardInstall tool={tool.id} />}
    </>
  );
}
