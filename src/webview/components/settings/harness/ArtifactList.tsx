import { useState } from 'react';
import { Badge, Checkbox } from '@radix-ui/themes';
import { agentOfArtifact, artifactLocation, selectableOfKind, type ArtifactKind, type BoardArtifact } from '../../../../shared/artifacts';
import type { AgentSuggestion } from '../../../../shared/agentSuggestions';
import { baseInfo } from '../../../../shared/harness';
import { matchesQuery } from '../../../../shared/harnessTopics';
import { ai, harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, DeleteButton, IconPlus, IconRules, IconSkills } from '../../ui';
import { AgentEditor } from './AgentEditor';
import { AgentWizard } from './AgentWizard';
import { AgentsToolbar, DefaultAgentBadge, DeleteAgentButton, MakeDefaultButton, useDefaultAgent } from './AgentsToolbar';
import { ArtifactBadges, RestoreAgentButton, UpdateFromOriginButton } from './ArtifactStatus';
import { BulkActions } from './BulkActions';
import { McpServerEditor } from './McpServerEditor';
import { NewAgent } from './NewAgent';
import { RuleEditor } from './RuleEditor';
import { RuleWizard } from './RuleWizard';
import { SkillEditor } from './SkillEditor';
import { SkillWizard } from './SkillWizard';
import { UsageSelect } from './UsageSelect';
import { t, tn } from '../../../i18n';

/** O que cada assunto diz quando está vazio; o "Novo…" e o "Importar" ficam ao lado. */
const EMPTY_TEXT: Record<ArtifactKind, string> = {
  rule: 'Nenhuma regra no board. Crie uma ou importe as que você já tem; elas entram desligadas, para você revisar antes de ativar.',
  skill: 'Nenhuma skill no board. Crie uma ou importe uma pasta com SKILL.md.',
  agent: 'Nenhum agente no board: toda execução roda com o escopo cheio. Crie um, use as sugestões prontas ou importe.',
  mcp: 'Nenhum servidor MCP no board. Cadastre um ou importe os que você já configurou.',
};

/** O texto de origem da linha: de onde veio a cópia, ou por que ela não vale. */
function originText(a: BoardArtifact): string | null {
  if (a.generated) return t('gerada pelo board');
  if (a.missing) return t('origem ausente na cópia');
  return a.origin ? t('importado de {origin}', { origin: a.origin }) : null;
}

/**
 * A lista de um assunto do Harness: uma linha por artefato do board, com o modo, a origem, "Editar" (abre o editor na
 * própria linha, um por vez) e "Apagar". A busca e a seleção vêm de quem a monta, para sobreviverem à troca de aba.
 */
export function ArtifactList({
  kind,
  query,
  picked,
  onPick,
  onImport,
}: {
  kind: ArtifactKind;
  query: string;
  picked: ReadonlySet<string>;
  onPick: (next: Set<string>) => void;
  onImport: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const all = (state.harness.library?.artifacts ?? []).filter((a) => a.kind === kind);
  const items = all.filter((a) => matchesQuery(query, a.name, a.description));
  // as skills do fluxo que não estão na biblioteca aparecem também, só para leitura: o board as entrega pelo get_skill
  const flowSkills =
    kind === 'skill'
      ? (state.harness.library?.flowSkills ?? []).filter(
          (f) => !all.some((a) => a.name === f.name) && matchesQuery(query, f.name, f.description),
        )
      : [];
  const chosen = all.filter((a) => picked.has(a.id));
  const tool = baseInfo(state.board.aiTool);
  // só uma coisa aberta por vez: o editor de uma linha, o formulário de novo ou um assistente
  const [open, setOpen] = useState<{ edit: string } | { create: true } | { wizard: AgentSuggestion | null } | null>(null);
  const editing = open && 'edit' in open ? open.edit : null;
  const creating = open !== null && 'create' in open;
  const wizard = open !== null && 'wizard' in open ? open : null;
  const close = () => setOpen(null);
  const busy = state.chat.busy;
  const defaultAgent = useDefaultAgent();

  const pick = (list: BoardArtifact[], checked: boolean) => {
    const next = new Set(picked);
    for (const a of list) {
      if (checked) next.add(a.id);
      else next.delete(a.id);
    }
    onPick(next);
  };

  const editor = (a: BoardArtifact) => {
    switch (a.kind) {
      case 'rule':
        return <RuleEditor key={a.id} rule={a} onClose={close} />;
      case 'skill':
        return <SkillEditor key={a.id} skill={a} onClose={close} />;
      case 'mcp':
        return <McpServerEditor key={a.id} server={a} onClose={close} />;
      case 'agent':
        return <AgentEditor key={a.id} agent={agentOfArtifact(a, tool.id)} tool={tool} onClose={close} />;
    }
  };

  const toolbar = () => {
    if (kind === 'agent')
      return (
        <AgentsToolbar
          onNew={() => setOpen(creating ? null : { create: true })}
          onWizard={(preset) => setOpen({ wizard: preset ?? null })}
        />
      );
    const toggle = (next: NonNullable<typeof open>) => setOpen(open && JSON.stringify(open) === JSON.stringify(next) ? null : next);
    const label = { rule: t('Nova regra'), skill: t('Nova skill'), mcp: t('Novo servidor') }[kind];
    return (
      <div className="actions-toolbar">
        <ActionButton hint={t('Abre o formulário; o artefato é gravado no board ao salvar.')} onClick={() => toggle({ create: true })}>
          <IconPlus /> {label}
        </ActionButton>
        {kind === 'rule' && (
          <>
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Um passo a passo para escrever uma regra; ela entra no board desligada.')}
              onClick={() => toggle({ wizard: null })}
            >
              <IconRules /> {t('Criar regra com ajuda')}
            </ActionButton>
            <ActionButton
              variant="soft"
              color="gray"
              disabled={busy}
              disabledReason={t('A IA ainda está respondendo no chat do board.')}
              hint={t('A IA lê o projeto e escreve de 3 a 5 regras, desligadas no board; acompanhe no chat do board.')}
              onClick={() => ai.suggestRules()}
            >
              {t('Sugerir regras com IA')}
            </ActionButton>
          </>
        )}
        {kind === 'skill' && (
          <>
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Um passo a passo para escrever uma skill; ela entra no board em "Pelo card".')}
              onClick={() => toggle({ wizard: null })}
            >
              <IconSkills /> {t('Criar skill com ajuda')}
            </ActionButton>
            <ActionButton
              variant="soft"
              color="gray"
              disabled={busy}
              disabledReason={t('A IA ainda está respondendo no chat do board.')}
              hint={t('A IA lê o projeto e cria de 3 a 5 skills, em "Pelo card"; acompanhe no chat do board.')}
              onClick={() => ai.suggestSkills()}
            >
              {t('Sugerir skills com IA')}
            </ActionButton>
          </>
        )}
      </div>
    );
  };

  const creator =
    kind === 'rule' ? (
      <RuleEditor onClose={close} />
    ) : kind === 'skill' ? (
      <SkillEditor onClose={close} />
    ) : kind === 'mcp' ? (
      <McpServerEditor onClose={close} />
    ) : (
      <NewAgent onClose={close} />
    );

  return (
    <div className="artifact-list">
      {toolbar()}
      {creating && creator}
      {wizard && kind === 'rule' && <RuleWizard onClose={close} />}
      {wizard && kind === 'skill' && <SkillWizard onClose={close} />}
      {wizard && kind === 'agent' && (
        <AgentWizard key={wizard.wizard?.id ?? 'wizard'} tool={tool} preset={wizard.wizard ?? undefined} onClose={close} />
      )}
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
      {all.length > 0 && items.length === 0 && <p className="muted small scope-empty">{t('Nada encontrado para a busca.')}</p>}
      {all.length > 0 && (
        <div className="item-list-head" role="group" aria-label={t('Ações em lote')}>
          <label className="item-check-all">
            <Checkbox
              aria-label={t('Selecionar todos os visíveis')}
              disabled={items.length === 0}
              checked={
                items.length > 0 && items.every((a) => picked.has(a.id))
                  ? true
                  : items.some((a) => picked.has(a.id))
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(checked) => pick(items, checked === true)}
            />
            <span className="muted small">{t('Selecionar todos')}</span>
          </label>
          {chosen.length > 0 && (
            <>
              <span className="muted small">{tn(chosen.length, 'um selecionado', '{n} selecionados')}</span>
              <BulkActions kind={kind} items={chosen} onDone={() => onPick(new Set())} />
            </>
          )}
        </div>
      )}
      <ul className="item-list">
        {items.flatMap((a) => {
          const origin = originText(a);
          const generatedSkill = a.kind === 'skill' && a.generated === true;
          const mcp = a.mcpCredential;
          return [
            <li key={a.id} className={`item-row${picked.has(a.id) ? ' selected' : ''}`}>
              <span className="item-check">
                <Checkbox
                  aria-label={t('Selecionar: {name}', { name: a.name })}
                  checked={picked.has(a.id)}
                  onCheckedChange={(checked) => pick([a], checked === true)}
                />
              </span>
              <div className="item-main">
                <div className="item-title">
                  {a.kind === 'rule' || a.kind === 'skill' ? (
                    <button
                      type="button"
                      className="path-link item-name"
                      title={t('Abre o texto no board, para ler e editar')}
                      onClick={() => useBoardStore.getState().openHarnessFile({ kind: a.kind as 'rule' | 'skill', name: a.name })}
                    >
                      {a.name}
                    </button>
                  ) : (
                    <span className="item-name">{a.name}</span>
                  )}
                  {a.kind === 'agent' && <DefaultAgentBadge name={a.name} />}
                  <ArtifactBadges artifact={a} />
                  {a.missing && (
                    <Badge color="amber" variant="soft">
                      {t('ausente')}
                    </Badge>
                  )}
                  {mcp?.review === 'pending' && (
                    <Badge color="amber" variant="soft">
                      {t('Revisão humana pendente')}
                    </Badge>
                  )}
                  {mcp && mcp.available === false && (
                    <Badge color="amber" variant="soft">
                      {t('Configuração local ausente')}
                    </Badge>
                  )}
                  {a.revision !== undefined && (
                    <span className="muted small" title={t('Versão do artefato no board')}>
                      {t('v{n}', { n: a.revision })}
                    </span>
                  )}
                </div>
                {(a.description || a.mcpSummary) && (
                  <p className="item-hint" title={a.description}>
                    {a.description || a.mcpSummary}
                  </p>
                )}
                {origin && <p className="muted small">{origin}</p>}
                {a.skipped.length > 0 && (
                  <p className="muted small" role="status">
                    {tn(
                      a.skipped.length,
                      'Um arquivo ficou de fora pelos limites: {files}',
                      '{n} arquivos ficaram de fora pelos limites: {files}',
                      { files: a.skipped.map((x) => x.path).join(', ') },
                    )}
                  </p>
                )}
              </div>
              <div className="row-actions">
                {(a.kind === 'agent' && a.name === defaultAgent) || generatedSkill ? (
                  <Badge
                    color="gray"
                    variant="outline"
                    title={
                      generatedSkill
                        ? t('O board entrega esta skill pelo get_skill, com o texto desta versão da extensão.')
                        : t('O agente padrão executa quando nem o card nem a fase escolhem outro; para desligá-lo, torne outro o padrão.')
                    }
                  >
                    {generatedSkill ? t('Entregue pelo board') : t('Disponível no board')}
                  </Badge>
                ) : (
                  <UsageSelect artifact={a} />
                )}
                {a.kind === 'agent' && a.usage !== 'off' && <MakeDefaultButton name={a.name} />}
                <UpdateFromOriginButton artifact={a} />
                <RestoreAgentButton artifact={a} />
                {!generatedSkill && (
                  <ActionButton
                    variant="ghost"
                    size="1"
                    aria-label={editing === a.id ? t('Fechar edição: {name}', { name: a.name }) : t('Editar: {name}', { name: a.name })}
                    hint={editing === a.id ? t('Fecha o editor; o que não foi salvo se perde.') : t('Abre o editor logo abaixo da linha.')}
                    onClick={() => setOpen(editing === a.id ? null : { edit: a.id })}
                  >
                    {editing === a.id ? t('Fechar edição') : t('Editar')}
                  </ActionButton>
                )}
                {a.kind === 'agent' && !a.agent?.seed && <DeleteAgentButton name={a.name} location={artifactLocation(a)} />}
                {a.kind !== 'agent' && !generatedSkill && (
                  <DeleteButton
                    title={t('Apagar o artefato')}
                    aria-label={t('Apagar: {name}', { name: a.name })}
                    question={t('Apagar "{name}"?', { name: a.name })}
                    message={t(
                      'A cópia do board é apagada e a ação não pode ser desfeita; o arquivo de origem fica. Os cards e os agentes que citam este artefato deixam de recebê-lo.',
                    )}
                    onConfirm={() => void harness.setSelection([{ kind: selectableOfKind(a.kind), location: artifactLocation(a) }], null)}
                  />
                )}
              </div>
            </li>,
            ...(editing === a.id ? [<li key={`${a.id}:edit`}>{editor(a)}</li>] : []),
          ];
        })}
        {flowSkills.map((f) => (
          <li key={`flow:${f.name}`} className="item-row">
            <span className="item-check" />
            <div className="item-main">
              <div className="item-title">
                <button
                  type="button"
                  className="path-link item-name"
                  title={t('Abre o texto só para leitura')}
                  onClick={() => useBoardStore.getState().openHarnessFile({ kind: 'skill', name: f.name })}
                >
                  {f.name}
                </button>
                <Badge color="gray" variant="outline" title={t('Vem com o board e acompanha a versão da extensão: só de leitura.')}>
                  {t('de fábrica')}
                </Badge>
              </div>
              <p className="item-hint" title={f.description}>
                {f.description}
              </p>
            </div>
            <div className="row-actions">
              <Badge
                color="gray"
                variant="outline"
                title={t('O board entrega esta skill pelo get_skill, com o texto desta versão da extensão.')}
              >
                {t('Entregue pelo board')}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
