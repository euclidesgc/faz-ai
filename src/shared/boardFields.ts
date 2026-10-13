import { CRITICALITY_FIELD } from './critical';
import { norm } from './filters';
import type { BoardState, FieldDef, FieldKind, Id, WorkflowKind } from './model';
import { EFFORT_FIELD } from './models';

// Os campos que o board padrão cria e que o mecanismo procura pelo nome: a triagem, as regras de modelo,
// o runner, a fase das sub-tarefas e o núcleo. Renomear, apagar ou trocar as opções de um deles quebra
// esse uso sem aviso, então eles ficam fora de Configurações → Campos personalizados e o host recusa
// essas mudanças, venham da tela ou do MCP.

/** A fase do documento que a sub-tarefa constrói; as opções acompanham as colunas das histórias. */
export const PHASE_FIELD = 'Fase';
export const TAGS_FIELD = 'Tags';
/** Qual modelo de IA (e com que esforço) executa o card. */
export const MODEL_FIELD = 'Modelo';
/** Skills do projeto que devem ser carregadas ao executar o card; as opções vêm do Harness. */
export const SKILLS_FIELD = 'Skills';
/** Arquivos de instruções marcados no Harness que a execução do card deve ler. */
export const RULES_FIELD = 'Rules';

export interface BoardField {
  name: string;
  /** só nos tipos de card que nascem num workflow deste tipo; sem ele, em todos os tipos */
  workflow?: WorkflowKind;
  /** as opções são da pessoa (a IA só escolhe entre elas); nos outros, quem as mantém é o board */
  ownOptions?: boolean;
}

export const BOARD_FIELDS: BoardField[] = [
  { name: PHASE_FIELD, workflow: 'child' },
  { name: TAGS_FIELD, ownOptions: true },
  { name: MODEL_FIELD },
  { name: SKILLS_FIELD },
  { name: RULES_FIELD },
  { name: EFFORT_FIELD },
  { name: CRITICALITY_FIELD, workflow: 'parent' },
];

/** O campo do board com este nome, sem diferença de maiúsculas nem de acentos. */
export const boardFieldNamed = (name: string): BoardField | undefined => BOARD_FIELDS.find((b) => norm(b.name) === norm(name.trim()));

export const isBoardField = (f: Pick<FieldDef, 'name'>): boolean => boardFieldNamed(f.name) !== undefined;

/** Por que o campo novo não pode ser criado; null quando pode. */
export function newFieldBlocker(input: { name: string; kind: FieldKind }): string | null {
  if (boardFieldNamed(input.name)) return `"${input.name.trim()}" é o nome de um campo do board; escolha outro nome.`;
  // o runner usa o primeiro campo de modelo do tipo do card: um segundo ficaria sem efeito
  if (input.kind === 'model') return `O campo de modelo de IA é só um, o "${MODEL_FIELD}" do board.`;
  return null;
}

/** Por que a mudança num campo do board não pode ser feita; null quando pode (ou quando o campo é personalizado). */
export function fieldChangeBlocker(
  state: BoardState,
  fieldId: Id,
  change: 'delete' | { name?: string; options?: string[]; appliesToTypes?: Id[] | null },
): string | null {
  const field = state.fieldDefs.find((f) => f.id === fieldId);
  const board = field && boardFieldNamed(field.name);
  if (!field || !board) return null;
  const { name } = field;
  if (change === 'delete') return `O campo "${name}" é do board e não pode ser apagado: as regras e a IA dependem dele.`;
  // mandar o mesmo valor de volta não muda nada e passa
  if (change.name !== undefined && change.name.trim() !== name)
    return `O campo "${name}" é do board e não pode ser renomeado: as regras e a IA o encontram pelo nome.`;
  if (change.options !== undefined && !board.ownOptions && JSON.stringify(change.options) !== JSON.stringify(field.options))
    return `As opções do campo "${name}" são mantidas pelo board.`;
  if (change.appliesToTypes !== undefined && JSON.stringify(change.appliesToTypes) !== JSON.stringify(field.appliesToTypes))
    return `Os tipos de card do campo "${name}" são mantidos pelo board.`;
  return null;
}
