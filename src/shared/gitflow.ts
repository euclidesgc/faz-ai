/**
 * Regras puras do gitflow (#462): de que tipo é a branch de uma história, de onde ela parte, para onde
 * vai o pull request, as linhas da tabela da tela Git e o texto dos avisos. Um lugar só para o handler,
 * o `get_card` e a tela, que assim não divergem.
 */
import type { BranchKind, GitConfig } from './git';
import { slug } from './git';
import type { BoardState, Card, CardType } from './model';

/** autor dos comentários escritos pelo próprio board (o mesmo de merge.ts, autopilot.ts e runner.ts) */
export const BOARD_AUTHOR = 'Faz AI';

/** tipo de branch da história: o do tipo de card dela; tipo apagado = feature */
export function branchKindOf(s: Pick<BoardState, 'cardTypes'>, story: Pick<Card, 'typeId'>): BranchKind {
  return s.cardTypes.find((t) => t.id === story.typeId)?.branchKind ?? 'feature';
}

/** o que entra em {fluxo}: o prefixo do tipo com o gitflow ligado; desligado, `<tipo>/` como antes do gitflow */
export function flowPrefix(git: GitConfig, kind: BranchKind, typeName: string): string {
  if (!git.gitflow) return `${slug(typeName) || 'card'}/`;
  return kind === 'hotfix' ? git.hotfixPrefix : kind === 'bugfix' ? git.bugfixPrefix : git.featurePrefix;
}

/** de onde parte uma branch nova fora da pilha: a develop (feature, bugfix) ou a principal (hotfix, gitflow desligado) */
export function flowBaseOf(git: GitConfig, kind: BranchKind, main: string): { base: string; isDevelop: boolean } {
  if (!git.gitflow || kind === 'hotfix') return { base: main, isDevelop: false };
  // develop com o mesmo nome da principal: parte da principal, e não há develop a criar
  const isDevelop = git.developBranch !== main;
  return { base: git.developBranch, isDevelop };
}

export interface PrBase {
  /** branch de onde a da história partiu; '' quando ela é anterior ao gitflow e a principal não foi detectada */
  baseBranch: string;
  /** branch para a qual o PR é aberto; nesta entrega é sempre igual a baseBranch */
  prBase: string;
  /** a base é a branch de outra história (pilha do modo autônomo ou derivada) */
  stacked: boolean;
}

/** null sem branch; base_branch vazio (história anterior ao gitflow) = a principal detectada */
export function prBaseOf(s: Pick<BoardState, 'cards' | 'mainBranch'>, story: Card): PrBase | null {
  if (!story.branch) return null;
  // a pilha é reconhecida pela branch: outra história tem a base como branch dela
  const stacked = !!story.baseBranch && s.cards.some((c) => c.id !== story.id && !c.parentId && c.branch === story.baseBranch);
  const baseBranch = story.baseBranch || s.mainBranch?.name || '';
  return { baseBranch, prBase: baseBranch, stacked };
}

export interface FlowRow {
  kind: 'main' | 'develop' | BranchKind | 'release';
  /** 'main', 'develop', 'feature/' ... com os nomes configurados */
  branch: string;
  /** nomes guardados dos tipos de card que geram este tipo de branch */
  types: string[];
  /** '' na principal */
  from: string;
  /** '' na principal e na develop */
  prTo: string;
}

/** as linhas da tabela da tela Git (RF21), na ordem em que aparecem */
export function flowRows(git: GitConfig, types: Pick<CardType, 'name' | 'branchKind'>[], main: string): FlowRow[] {
  const dev = git.developBranch;
  const typesOf = (kind: BranchKind) => types.filter((t) => t.branchKind === kind).map((t) => t.name);
  return [
    { kind: 'main', branch: main, types: [], from: '', prTo: '' },
    { kind: 'develop', branch: dev, types: [], from: main, prTo: '' },
    { kind: 'feature', branch: git.featurePrefix, types: typesOf('feature'), from: dev, prTo: dev },
    { kind: 'bugfix', branch: git.bugfixPrefix, types: typesOf('bugfix'), from: dev, prTo: dev },
    { kind: 'hotfix', branch: git.hotfixPrefix, types: typesOf('hotfix'), from: main, prTo: main },
    // a release não sai de nenhum tipo de card: é o processo de release do projeto
    { kind: 'release', branch: git.releasePrefix, types: [], from: dev, prTo: main },
  ];
}

/** O que aconteceu ao criar a branch e merece um aviso na conversa da história. */
export type GitNotice =
  | { kind: 'noOrigin'; branch: string; base: string }
  | { kind: 'fetchFailed'; branch: string; base: string; error: string }
  | { kind: 'developCreated'; develop: string; main: string }
  | { kind: 'developLocalOnly'; develop: string; main: string; error: string }
  | { kind: 'developNotPushed'; develop: string };

/** o texto do aviso na conversa, em português; a tradução fica em i18n/en/host.ts */
export function gitNoticeText(n: GitNotice): string {
  switch (n.kind) {
    case 'noOrigin':
      return `O repositório não tem origin: a branch ${n.branch} partiu de ${n.base} como está nesta máquina.`;
    case 'fetchFailed':
      return `Não foi possível atualizar as refs do origin antes de criar a branch ${n.branch} (${n.error}). Ela partiu de ${n.base} como está nesta máquina, que pode estar desatualizada.`;
    case 'developCreated':
      return `A branch ${n.develop} não existia: o board a criou a partir de ${n.main} e a enviou ao origin.`;
    case 'developLocalOnly':
      return `A branch ${n.develop} não existia: o board a criou a partir de ${n.main}, mas não conseguiu enviá-la ao origin (${n.error}). Envie à mão: git push -u origin ${n.develop}`;
    case 'developNotPushed':
      return `A branch ${n.develop} existe só nesta máquina: o pull request para ela só abre depois de enviá-la ao origin (git push -u origin ${n.develop}).`;
  }
}
