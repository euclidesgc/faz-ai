import { useState } from 'react';
import { Callout, SegmentedControl, TextField } from '@radix-ui/themes';
import type { ArtifactAssistDraft, AssistKind } from '../../../../shared/artifactAssistant';
import { filterArtifacts, type StatusFilter } from '../../../../shared/artifactLibrary';
import type { ArtifactKind, BoardArtifact } from '../../../../shared/artifacts';
import { matchesQuery } from '../../../../shared/harnessTopics';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, IconAi, IconInfo, IconPlus } from '../../ui';
import { ArtifactAssistant } from './ArtifactAssistant';
import { ArtifactFormModal } from './ArtifactFormModal';
import { ArtifactRow } from './ArtifactRow';
import { FlowSkillRow } from './FlowSkillRow';
import { McpServerEditor } from './McpServerEditor';
import { RuleFormModal } from './RuleFormModal';
import { SkillFolderTree } from './SkillFolderTree';
import { t } from '../../../i18n';

/** O que cada assunto diz quando está vazio; o "Novo…" e o "Importar" ficam ao lado. */
const EMPTY_TEXT: Record<ArtifactKind, string> = {
  rule: 'Nenhuma regra no board. Crie uma ou importe as que você já tem; elas entram desligadas, para você revisar antes de ativar.',
  skill: 'Nenhuma skill no board. Crie uma ou importe uma pasta com SKILL.md.',
  agent: 'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um, use as sugestões prontas ou importe.',
  mcp: 'Nenhum servidor MCP no board. Cadastre um ou importe os que você já configurou.',
};

/** O que "ativo" quer dizer na aba, em uma frase. */
const SCOPE_NOTE: Record<ArtifactKind, string> = {
  rule: 'Regras ativas entram em todo contexto de IA deste board.',
  skill: 'Skills ativas podem ser vinculadas a cards e só entram no contexto dos cards vinculados.',
  agent: 'Agentes ativos podem ser escolhidos no card (um por card) e executam a ação dele.',
  mcp: 'Servidores MCP ativos ficam em "Sempre" (em toda execução) ou "Pelo card" (só nos cards que os indicam).',
};

const NEW_LABEL: Record<ArtifactKind, string> = {
  rule: 'Nova regra',
  skill: 'Nova skill',
  agent: 'Novo agente',
  mcp: 'Novo servidor',
};

/** Rótulos do filtro: regras e skills são femininas, agentes e servidores masculinos. */
function statusLabels(kind: ArtifactKind): Record<StatusFilter, string> {
  return kind === 'rule' || kind === 'skill'
    ? { all: t('Todas'), active: t('Ativas'), inactive: t('Inativas') }
    : { all: t('Todos'), active: t('Ativos'), inactive: t('Inativos') };
}

/** O que está aberto na aba: um formulário (modal), o assistente "Criar com IA" ou o editor do servidor MCP (`''` = novo). */
type Open =
  { form: AssistKind; artifact?: BoardArtifact; initial?: Partial<ArtifactAssistDraft> } | { assist: AssistKind } | { mcp: string } | null;

/**
 * Uma aba da biblioteca: o aviso do que "ativo" quer dizer, os botões de criar, a busca e o filtro, e a lista. A
 * busca, o filtro e a pasta vêm de quem a monta, para sobreviverem à troca de aba. Só uma coisa fica aberta por vez.
 */
export function ArtifactList({
  kind,
  topicLabel,
  query,
  onQuery,
  status,
  onStatus,
  folder,
  onFolder,
  onImport,
}: {
  kind: ArtifactKind;
  /** o nome da aba, já traduzido, para o rótulo da busca */
  topicLabel: string;
  query: string;
  onQuery: (next: string) => void;
  status: StatusFilter;
  onStatus: (next: StatusFilter) => void;
  /** só nas skills: a pasta selecionada (`null` = todas) */
  folder: string | null;
  onFolder: (next: string | null) => void;
  onImport: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const all = (state.harness.library?.artifacts ?? []).filter((a) => a.kind === kind);
  const items = filterArtifacts(all, { query, status, folder });
  // as skills do fluxo que não estão na biblioteca aparecem também, só para leitura: o board as entrega pelo get_skill
  const flowSkills =
    kind === 'skill' && folder === null && status !== 'inactive'
      ? (state.harness.library?.flowSkills ?? []).filter(
          (f) => !all.some((a) => a.name === f.name) && matchesQuery(query, f.name, f.description),
        )
      : [];
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const labels = statusLabels(kind);
  const seed = useAction(() => harness.seedAgents(true));
  const aiKind: AssistKind | null = kind === 'mcp' ? null : kind;
  const mcpOpen = open !== null && 'mcp' in open ? open.mcp : null;

  const duplicate = (a: BoardArtifact) =>
    setOpen({
      form: a.kind as AssistKind,
      initial: { name: `${a.name}-copia`, description: a.description, version: a.version, folder: a.folder, tools: a.tools },
    });

  const rows = (
    <ul className="item-list">
      {items.flatMap((a) => [
        <ArtifactRow
          key={a.id}
          artifact={a}
          kind={kind}
          onEdit={() => setOpen(kind === 'mcp' ? { mcp: a.id } : { form: a.kind as AssistKind, artifact: a })}
          onDuplicate={kind === 'mcp' ? undefined : () => duplicate(a)}
        />,
        ...(mcpOpen === a.id
          ? [
              <li key={`${a.id}:edit`}>
                <McpServerEditor server={a} onClose={close} />
              </li>,
            ]
          : []),
      ])}
      {flowSkills.map((f) => (
        <FlowSkillRow key={`flow:${f.name}`} name={f.name} description={f.description} />
      ))}
    </ul>
  );

  return (
    <div className="artifact-list">
      <Callout.Root color="gray" size="1" className="harness-callout">
        <Callout.Icon>
          <IconInfo />
        </Callout.Icon>
        <Callout.Text>{t(SCOPE_NOTE[kind])}</Callout.Text>
      </Callout.Root>
      <div className="actions-toolbar">
        <span className="toolbar-group">
          {aiKind && (
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('A IA faz perguntas, uma por vez, e monta o rascunho; nada é gravado até você revisar e salvar.')}
              onClick={() => setOpen({ assist: aiKind })}
            >
              <IconAi /> {t('Criar com IA')}
            </ActionButton>
          )}
          <ActionButton
            hint={t('Abre o formulário; o artefato é gravado no board ao salvar.')}
            onClick={() => setOpen(aiKind ? { form: aiKind } : mcpOpen === '' ? null : { mcp: '' })}
          >
            <IconPlus /> {t(NEW_LABEL[kind])}
          </ActionButton>
        </span>
        {kind === 'agent' && (
          <span className="toolbar-group">
            <ActionButton
              variant="ghost"
              loading={seed.busy}
              hint={t('Cria de novo os agentes de fábrica que não existem mais; não mexe nos que existem.')}
              onClick={() => void seed.run()}
            >
              {t('Recriar os de fábrica')}
            </ActionButton>
          </span>
        )}
      </div>
      {all.length > 0 && (
        <div className="topic-bar">
          <TextField.Root
            className="topic-search"
            type="search"
            aria-label={t('Buscar em {topic} por nome ou descrição', { topic: topicLabel })}
            placeholder={kind === 'skill' ? t('Buscar por nome, descrição ou pasta…') : t('Buscar por nome ou descrição…')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          <SegmentedControl.Root
            size="1"
            value={status}
            aria-label={t('Filtrar por estado')}
            onValueChange={(v) => onStatus(v as StatusFilter)}
          >
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <SegmentedControl.Item key={s} value={s}>
                {labels[s]}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        </div>
      )}
      {mcpOpen === '' && <McpServerEditor onClose={close} />}
      {all.length === 0 && (
        <div className="board-empty">
          <p className="muted small">{t(EMPTY_TEXT[kind])}</p>
          <ActionButton
            variant="soft"
            color="gray"
            size="1"
            hint={t('Abre o diálogo para importar artefatos para o board.')}
            onClick={onImport}
          >
            {t('Importar')}
          </ActionButton>
        </div>
      )}
      {all.length > 0 && items.length === 0 && flowSkills.length === 0 && (
        <p className="muted small scope-empty">{t('Nada encontrado para a busca.')}</p>
      )}
      {kind === 'skill' ? (
        <div className="library-split">
          <SkillFolderTree folders={state.harness.library?.skillFolders ?? []} skills={all} selected={folder} onSelect={onFolder} />
          {rows}
        </div>
      ) : (
        all.length > 0 && rows
      )}
      {open && 'form' in open && open.form === 'rule' && (
        <RuleFormModal rule={open.artifact} initial={open.initial} onClose={close} onAssist={() => setOpen({ assist: 'rule' })} />
      )}
      {open && 'form' in open && open.form !== 'rule' && (
        <ArtifactFormModal
          kind={open.form}
          artifact={open.artifact}
          initial={open.initial}
          onClose={close}
          onAssist={() => setOpen({ assist: open.form })}
        />
      )}
      {open && 'assist' in open && (
        <ArtifactAssistant kind={open.assist} onClose={close} onFinish={(draft) => setOpen({ form: open.assist, initial: draft })} />
      )}
    </div>
  );
}
