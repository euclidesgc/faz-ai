// Contrato dos adaptadores do "Exportar para a ferramenta" (#623): cada ferramenta diz onde grava,
// como renderiza cada artefato no formato oficial e o que se perde nele.
import type { SelectableKind } from '../../shared/harnessSelection';
import type { AiTool } from '../../shared/harness';
import type { ArtifactDraft } from '../../shared/artifacts';
import type { ArtifactRow } from '../repositories/artifactRepo';
import type { ExportKind, ExportTarget, FormatLoss, RefuseReason } from '../../shared/toolExport';

export interface ExportSource {
  /** do ArtifactRepo, com o `meta` cru */
  artifact: ArtifactRow;
  /** o corpo inteiro (regra: o arquivo; skill: o SKILL.md; agente: as instruções), de `ArtifactRepo.content` */
  body: string;
  /** arquivos de apoio (skill), de `ArtifactRepo.content` */
  files: ArtifactDraft['files'];
  isDefaultAgent: boolean;
}

export interface RenderedFile {
  /** relativo à base, com '/', sempre começando por `${root}/` */
  rel: string;
  data: Buffer;
  /** ids dos artefatos que o arquivo leva (mais de um: regras do Kimi) */
  from: string[];
}

/** Um artefato encontrado na pasta da ferramenta; `kind` e `location` são os que `readSource` entende (regra = `instructions`). */
export interface ListedSource {
  kind: SelectableKind;
  location: string;
  scope: 'project' | 'user';
}

export interface ToolAdapter {
  tool: AiTool;
  root: '.claude' | '.cursor' | '.kimi-code';
  /** o formato tem esse artefato nesse destino? (Cursor + usuário + regra = não) */
  supports(kind: ExportKind, target: ExportTarget): boolean;
  /** os arquivos dos artefatos de um tipo; o que não dá para gravar volta em `refused` */
  render(
    kind: ExportKind,
    sources: ExportSource[],
    target: ExportTarget,
  ): { files: RenderedFile[]; refused: { id: string; reason: RefuseReason }[] };
  /** a pasta da skill no destino, relativa à base, para listar os extras */
  skillDir(name: string): string;
  /** o que há na pasta da ferramenta (só lê); `base` é a pasta do projeto ou a do usuário, conforme o destino */
  list(target: ExportTarget, base: string): ListedSource[];
  /** os arquivos de servidores MCP da ferramenta, como `location` sem o `#nome` */
  mcpFiles(target: ExportTarget, base: string): string[];
  losses(source: ExportSource): FormatLoss[];
}
