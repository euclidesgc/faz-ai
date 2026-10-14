import { RadioGroup } from '@radix-ui/themes';
import { AI_TOOLS, type AiTool } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { settings } from '../../../commands';
import { useAction } from '../../../useAction';
import { SectionHeader } from '../SectionHeader';
import { t } from '../../../i18n';

/** Escolha da ferramenta de IA do projeto (uma por vez). */
export function ProjectTool({ tool }: { tool: AiToolInfo }) {
  // trocar a ferramenta relê o harness e confere a CLI nova: a tabela mostra a espera até o host confirmar
  const change = useAction((id: AiTool) => settings.updateBoard({ aiTool: id }));
  const chooseTool = (id: AiTool) => id !== tool.id && void change.run(id);
  return (
    <>
      <SectionHeader id="harness-tool" title={t('Ferramenta deste projeto')}>
        {t(
          'O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas. O servidor MCP do board e a skill do fluxo são instalados na aba de cada ferramenta, nos assuntos MCPs e Skills, em Projeto.',
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
              <th>Skills</th>
              <th>MCP</th>
            </tr>
          </thead>
          <tbody>
            {AI_TOOLS.map((x) => (
              <tr key={x.id} className={x.id === tool.id ? '' : 'off'}>
                <td>
                  <RadioGroup.Item value={x.id} aria-label={x.label} />
                </td>
                <td>{x.label}</td>
                <td>
                  <code>{x.rules}</code>
                </td>
                <td>
                  <code>{x.skills}</code>
                </td>
                <td>
                  <code>{t(x.mcp)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RadioGroup.Root>
    </>
  );
}
