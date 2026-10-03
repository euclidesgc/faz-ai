import { AI_TOOLS, type AiTool } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import { settings, ui } from '../../../commands';
import { Button } from '../../ui';

/** Escolha da ferramenta de IA do projeto (uma por vez) e o registro do MCP do board nela. */
export function ProjectTool({ tool }: { tool: AiToolInfo }) {
  const chooseTool = (id: AiTool) => id !== tool.id && settings.updateBoard({ aiTool: id });
  return (
    <>
      <h3>Ferramenta deste projeto</h3>
      <p className="muted small">
        O projeto trabalha com uma ferramenta de IA por vez. Ela define o arquivo de regras, a pasta das skills, onde o servidor MCP é
        registrado e os modelos oferecidos nos cards. Pastas de outras ferramentas podem existir no projeto, mas o board não mexe nelas.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>Ferramenta</th>
            <th>Regras</th>
            <th>Skills</th>
            <th>MCP</th>
          </tr>
        </thead>
        <tbody>
          {AI_TOOLS.map((t) => (
            <tr key={t.id} className={t.id === tool.id ? '' : 'off'}>
              <td>
                <input type="radio" name="ai-tool" checked={t.id === tool.id} onChange={() => chooseTool(t.id)} />
              </td>
              <td>{t.label}</td>
              <td>
                <code>{t.rules}</code>
              </td>
              <td>
                <code>{t.skills}</code>
              </td>
              <td>
                <code>{t.mcp}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <Button variant="primary" onClick={() => ui.connectAI()}>
          Conectar o {tool.label} ao board (MCP)
        </Button>
        <span className="muted small">Registra o servidor do board em {tool.mcp}.</span>
      </div>
    </>
  );
}
