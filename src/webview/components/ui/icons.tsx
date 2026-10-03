import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bold,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  CornerDownRight,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  GripVertical,
  Hand,
  Heading,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListTodo,
  ListTree,
  Maximize2,
  MessageSquare,
  Minimize2,
  Paperclip,
  Pencil,
  Play,
  Quote,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

export type IconProps = Omit<LucideProps, 'ref'>;
export type Icon = (props: IconProps) => JSX.Element;

/**
 * Ícone no tamanho (`1em`) e na cor (`currentColor`) do texto em volta. É decorativo: o nome
 * acessível fica no botão (`title`/`aria-label`) ou no texto ao lado.
 */
function icon(Glyph: LucideIcon, name: string): Icon {
  const Wrapped = ({ className, ...rest }: IconProps) => (
    <Glyph size="1em" strokeWidth={2} aria-hidden className={className ? `glyph ${className}` : 'glyph'} {...rest} />
  );
  Wrapped.displayName = name;
  return Wrapped;
}

// Mapa semântico: o único ponto que importa de lucide-react. Trocar um ícone aqui troca em todo o board.

// janela e ações
export const IconOpen = icon(Maximize2, 'IconOpen');
export const IconCollapse = icon(Minimize2, 'IconCollapse');
export const IconMore = icon(Ellipsis, 'IconMore');
export const IconClose = icon(X, 'IconClose');
export const IconTrash = icon(Trash2, 'IconTrash');
export const IconEdit = icon(Pencil, 'IconEdit');
export const IconCheck = icon(Check, 'IconCheck');
export const IconRun = icon(Play, 'IconRun');
export const IconDrag = icon(GripVertical, 'IconDrag');
export const IconExternal = icon(ExternalLink, 'IconExternal');
export const IconWarning = icon(TriangleAlert, 'IconWarning');

// direção
export const IconChevronDown = icon(ChevronDown, 'IconChevronDown');
export const IconChevronLeft = icon(ChevronLeft, 'IconChevronLeft');
export const IconChevronRight = icon(ChevronRight, 'IconChevronRight');
export const IconArrowUp = icon(ArrowUp, 'IconArrowUp');
export const IconArrowDown = icon(ArrowDown, 'IconArrowDown');

// conteúdo do card
export const IconParent = icon(CornerDownRight, 'IconParent');
export const IconSubtasks = icon(ListTree, 'IconSubtasks');
export const IconChecklist = icon(ListChecks, 'IconChecklist');
export const IconComments = icon(MessageSquare, 'IconComments');
export const IconAttachment = icon(Paperclip, 'IconAttachment');
export const IconDescription = icon(AlignLeft, 'IconDescription');
export const IconSuggest = icon(Sparkles, 'IconSuggest');
export const IconApproval = icon(Hand, 'IconApproval');
export const IconBranch = icon(GitBranch, 'IconBranch');
export const IconPr = icon(GitPullRequest, 'IconPr');

// com quem está a pendência
export const IconAi = icon(Bot, 'IconAi');
export const IconHuman = icon(User, 'IconHuman');

// barra do editor de markdown
export const IconBold = icon(Bold, 'IconBold');
export const IconItalic = icon(Italic, 'IconItalic');
export const IconHeading = icon(Heading, 'IconHeading');
export const IconList = icon(List, 'IconList');
export const IconListOrdered = icon(ListOrdered, 'IconListOrdered');
export const IconTaskList = icon(ListTodo, 'IconTaskList');
export const IconQuote = icon(Quote, 'IconQuote');
export const IconCode = icon(Code, 'IconCode');
export const IconLink = icon(Link, 'IconLink');
