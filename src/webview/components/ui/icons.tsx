import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bold,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleArrowUp,
  Code,
  Columns3,
  CornerDownRight,
  Cpu,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  GripVertical,
  Hand,
  Heart,
  Heading,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListTodo,
  Link2,
  ListTree,
  Maximize2,
  MessageSquare,
  MessagesSquare,
  SendHorizontal,
  Square,
  Minimize2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Play,
  Plug,
  Plus,
  Quote,
  RotateCcw,
  Scale,
  Shapes,
  UserCog,
  Sparkles,
  TextCursorInput,
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
export const IconHeart = icon(Heart, 'IconHeart');
export const IconPlus = icon(Plus, 'IconPlus');
export const IconPanelClose = icon(PanelLeftClose, 'IconPanelClose');
export const IconPanelOpen = icon(PanelLeftOpen, 'IconPanelOpen');

// direção
export const IconChevronDown = icon(ChevronDown, 'IconChevronDown');
export const IconChevronLeft = icon(ChevronLeft, 'IconChevronLeft');
export const IconChevronRight = icon(ChevronRight, 'IconChevronRight');
export const IconArrowUp = icon(ArrowUp, 'IconArrowUp');
export const IconArrowDown = icon(ArrowDown, 'IconArrowDown');

// conteúdo do card
export const IconParent = icon(CornerDownRight, 'IconParent');
export const IconSubtasks = icon(ListTree, 'IconSubtasks');
export const IconCardLink = icon(Link2, 'IconCardLink');
export const IconChecklist = icon(ListChecks, 'IconChecklist');
export const IconComments = icon(MessageSquare, 'IconComments');
export const IconChat = icon(MessagesSquare, 'IconChat');
export const IconSend = icon(SendHorizontal, 'IconSend');
export const IconStop = icon(Square, 'IconStop');
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

// configurações: abas do menu lateral e ações do board
export const IconColumns = icon(Columns3, 'IconColumns');
export const IconTypes = icon(Shapes, 'IconTypes');
export const IconFields = icon(TextCursorInput, 'IconFields');
export const IconRules = icon(Scale, 'IconRules');
export const IconHarness = icon(BrainCircuit, 'IconHarness');
export const IconAgents = icon(UserCog, 'IconAgents');
export const IconModels = icon(Cpu, 'IconModels');
export const IconAppearance = icon(Palette, 'IconAppearance');
export const IconConnect = icon(Plug, 'IconConnect');
export const IconUpgrade = icon(CircleArrowUp, 'IconUpgrade');
export const IconReset = icon(RotateCcw, 'IconReset');
