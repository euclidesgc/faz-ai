import { expandArgLines, type AiProfile } from '../../../shared/aiProfiles';
import { isSafeRelPath } from '../../../shared/artifacts';
import { textReader } from '../../aiOutput/text';
import { boardOnlyMcpConfig } from '../../execution';
import { tmpArg, type AiProvider } from '../provider';

/** Montagem configurável não representa suporte verificado ao contrato de execução. */
export function genericProvider(profile: AiProfile): AiProvider {
  const config = profile.config;
  return {
    tool: profile.id,
    measure: 'none',
    reader: () => textReader(),
    command: (input) => {
      if (!config.command) throw new Error('Informe o comando do perfil personalizado.');
      if (input.exec?.toolSet === 'explicit') throw new Error('Perfil genérico sem tradução do contrato neutro.');
      if (input.permission !== 'full' && !config.permissionArgs?.[input.permission]?.length)
        throw new Error('O perfil não declara argumentos para esta permissão restrita.');
      const lines = [...(config.args ?? []), ...(config.permissionArgs?.[input.permission] ?? [])];
      const via = config.boardServer ?? 'cli';
      const mcp = via === 'cli' ? (input.exec?.mcpConfig ?? (input.boardServer ? boardOnlyMcpConfig(input.boardServer) : null)) : null;
      if (via === 'project' && (!config.mcpProjectFile || !isSafeRelPath(config.mcpProjectFile)))
        throw new Error('Arquivo MCP do perfil precisa ser relativo ao projeto.');
      const args = expandArgLines(lines, {
        ...(config.promptVia === 'arg' ? { prompt: input.prompt } : {}),
        model: input.exec?.model?.name ?? '',
        effort: input.exec?.model?.effort ?? '',
        mcpConfig: mcp ? tmpArg('mcp.json') : '',
        addDir: input.addDirs ?? [],
      });
      if (config.promptVia === 'arg' && !lines.some((line) => line.includes('{prompt}'))) args.push(input.prompt);
      return {
        command: config.command,
        args,
        format: 'text',
        env: { ...config.env },
        lookup: { onlyPath: true },
        noShell: true,
        ...(config.promptVia !== 'arg' ? { stdin: input.prompt } : {}),
        ...(mcp ? { tempFiles: { 'mcp.json': mcp } } : {}),
        ...(via === 'project' && input.boardServer ? { projectMcp: { file: config.mcpProjectFile!, entry: input.boardServer } } : {}),
      };
    },
  };
}
