import { useState, type KeyboardEvent } from 'react';
import { Button, Card, IconButton, Text, TextField } from '@radix-ui/themes';
import { catalogTool, isAcpProfile, isReadyCli, type AiBase, type AiProfile } from '../../../../shared/aiProfiles';
import type { AiTool } from '../../../../shared/harness';
import { modelId, type ModelOption } from '../../../../shared/models';
import { olderThan } from '../../../../shared/claudeModelDocs';
import { useAgentConnectStore } from '../../../store/agentConnectStore';
import { settings } from '../../../commands';
import { formatDateTime, t } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, FormField, IconPlus, IconTrash, SelectField, SwitchField } from '../../ui';
import { useSentList } from '../useSentList';

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** De onde vem a lista de modelos de cada CLI pronta ao clicar em "Detectar". */
const SOURCES: Record<AiBase, string> = {
  claude:
    'lida da página de modelos da documentação do Claude Code (a CLI não lista os modelos), com a versão mínima de cada um; sem rede, lista embutida na extensão',
  cursor: 'lida do comando cursor-agent models, com a conta em uso; sem a CLI autenticada, lista embutida na extensão',
  kimi: 'lida do comando kimi provider list --json, com os provedores configurados; sem a CLI, lista embutida na extensão',
};

const EMPTY_DRAFT = { model: '', label: '', efforts: '' };

/** Rascunho do modelo novo: nome, identificador na ferramenta e os esforços aceitos. */
function NewModelCard({
  tool,
  taken,
  onAdd,
  onDone,
}: {
  tool: AiTool;
  taken: (id: string) => boolean;
  onAdd: (m: ModelOption) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const model = draft.model.trim();
  const ready = model !== '' && !taken(modelId(tool, model));
  const add = () => {
    if (!ready) return;
    const efforts = splitList(draft.efforts);
    onAdd({ id: modelId(tool, model), tool, model, label: draft.label.trim() || model, efforts, defaultEffort: efforts[0] ?? null });
    onDone();
  };
  const set = (patch: Partial<typeof EMPTY_DRAFT>) => setDraft({ ...draft, ...patch });
  const enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') onDone();
  };
  return (
    <Card className="draft-card" aria-label={t('Modelo novo')}>
      <div className="form-grid">
        <FormField label={t('Nome')}>
          {(id) => (
            <TextField.Root
              id={id}
              autoFocus
              value={draft.label}
              placeholder={t('Ex.: Sonnet 5.5')}
              onChange={(e) => set({ label: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
        <FormField
          label={t('Identificador na ferramenta')}
          hint={draft.model.trim() && !ready ? t('Já existe um modelo com este identificador.') : undefined}
        >
          {(id) => (
            <TextField.Root
              id={id}
              value={draft.model}
              placeholder={t('identificador')}
              onChange={(e) => set({ model: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
        <FormField label={t('Esforços aceitos')} hint={t('Separados por vírgula; o primeiro é o padrão.')}>
          {(id) => (
            <TextField.Root
              id={id}
              value={draft.efforts}
              placeholder="low, medium, high"
              onChange={(e) => set({ efforts: e.target.value })}
              onKeyDown={enter}
            />
          )}
        </FormField>
      </div>
      <div className="form-actions">
        <Button variant="soft" color="gray" onClick={onDone}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!ready} onClick={add}>
          {t('Adicionar modelo')}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Os modelos do agente, com os níveis de esforço de cada um: o catálogo que o campo Modelo dos cards, o chat e as
 * regras de sugestão oferecem para ele. Detectar lê a lista da ferramenta; o que você cadastrou à mão fica.
 */
export function AgentModels({ profile }: { profile: AiProfile }) {
  const board = useBoardStore((s) => s.state!.board);
  const catalog = board.modelCatalog;
  const tool = catalogTool(profile);
  // a versão instalada, para o aviso do modelo que pede uma CLI mais nova (a sonda do perfil, ou a do Conectar)
  const probed = useAgentConnectStore((s) => s.statuses[profile.id]?.version);
  const connected = useBoardStore((s) => s.state?.connections?.[profile.id]?.summary.version);
  const installed = probed ?? connected;
  const [adding, setAdding] = useState(false);
  const detect = useAction(() => settings.detectModels(tool));
  // as mudanças partem da última lista enviada (ver useSentList)
  const sent = useSentList(catalog, settings.setModels);
  const setCatalog = sent.save;
  const patchModel = (id: string, patch: Partial<ModelOption>) =>
    setCatalog(sent.current().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  // o agente ACP anuncia os modelos ao abrir a sessão: o "Detectar" vale para ele como para as CLIs prontas
  const acp = isAcpProfile(profile);
  const detectable = isReadyCli(profile) || acp;
  const source = acp
    ? t('lida do agente ao abrir uma sessão ACP (session/new), sem gastar a sua conta; o agente precisa estar instalado e com login')
    : profile.kind === 'custom'
      ? t('cadastrada à mão')
      : t(SOURCES[profile.base as AiBase] ?? 'cadastrada à mão');
  const mine = catalog.filter((o) => o.tool === tool);
  // a leitura mais recente da lista da ferramenta; sem ela, a lista é a embutida ou a sua
  const readAt = Math.max(0, ...mine.map((o) => o.readAt ?? 0));
  return (
    <section className="agent-models" aria-label={t('Modelos do agente')}>
      <div className="row wrap agent-models-head">
        <Text size="2" color="gray">
          {t('{count} modelo(s)', { count: mine.length })}
          {readAt > 0 &&
            ` · ${t(profile.base === 'claude' ? 'lista lida da documentação em {date}' : 'lista lida da ferramenta em {date}', { date: formatDateTime(readAt) })}`}
        </Text>
        <div className="row">
          {detectable && (
            <ActionButton
              size="1"
              variant="soft"
              color="gray"
              loading={detect.busy}
              disabled={!profile.enabled}
              disabledReason={t('Ligue o agente antes: o board lê os modelos só dos agentes ligados.')}
              hint={t('Fonte: {source}', { source })}
              onClick={() => void detect.run()}
            >
              {t('Detectar modelos')}
            </ActionButton>
          )}
          <ActionButton
            size="1"
            disabled={adding}
            disabledReason={t('O formulário já está aberto logo abaixo.')}
            hint={t('Abre o formulário de um modelo novo.')}
            onClick={() => setAdding(true)}
          >
            <IconPlus /> {t('Novo modelo')}
          </ActionButton>
        </div>
      </div>
      {tool === 'cursor' && (
        <div className="models-fast">
          <SwitchField
            label={t('Incluir os modos rápidos')}
            checked={board.rules.includeFastModels}
            onChange={(includeFastModels) => settings.updateRules({ includeFastModels })}
          />
          <Text as="p" size="1" color="gray">
            {t(
              'O Cursor tem uma versão rápida de muitos modelos: responde mais depressa e cobra mais pelos mesmos tokens. Ligado, cada uma entra no catálogo como um modelo à parte (por exemplo, "Claude Opus 5.5 1M Fast"); desligado, elas saem do catálogo. A lista vem do comando cursor-agent models, lido com a CLI autenticada.',
            )}
          </Text>
        </div>
      )}
      {adding && (
        <NewModelCard
          tool={tool}
          taken={(id) => catalog.some((o) => o.id === id)}
          onAdd={(m) => setCatalog([...sent.current(), m])}
          onDone={() => setAdding(false)}
        />
      )}
      <table className="table">
        <thead>
          <tr>
            <th>{t('Nome')}</th>
            <th>{t('Identificador na ferramenta')}</th>
            <th>{t('Esforços aceitos (separados por vírgula)')}</th>
            <th>{t('Esforço padrão')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mine.map((o) => (
            <tr key={o.id}>
              <td>
                <TextField.Root
                  aria-label={t('Nome de {model}', { model: o.model })}
                  key={o.label}
                  defaultValue={o.label}
                  onBlur={(e) =>
                    e.target.value.trim() && e.target.value.trim() !== o.label && patchModel(o.id, { label: e.target.value.trim() })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                {/* a CLI mais velha que a documentação pede: o apelido roda um modelo anterior a este */}
                {o.requires && olderThan(installed, o.requires) && (
                  <Text as="p" size="1" color="amber" className="model-requires">
                    {t('Pede o Claude Code v{required} ou mais novo; o instalado é {installed}. Rode claude update.', {
                      required: o.requires,
                      installed: installed ?? '?',
                    })}
                  </Text>
                )}
              </td>
              <td>
                <code>{o.model}</code>
              </td>
              <td>
                <TextField.Root
                  aria-label={t('Esforços de {model}', { model: o.model })}
                  key={o.efforts.join()}
                  defaultValue={o.efforts.join(', ')}
                  placeholder={t('sem ajuste de esforço')}
                  onBlur={(e) => {
                    const efforts = splitList(e.target.value);
                    if (efforts.join() !== o.efforts.join())
                      patchModel(o.id, {
                        efforts,
                        defaultEffort: o.defaultEffort && efforts.includes(o.defaultEffort) ? o.defaultEffort : (efforts[0] ?? null),
                      });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </td>
              <td className="narrow">
                {o.efforts.length > 0 && (
                  <SelectField
                    aria-label={t('Esforço padrão de {model}', { model: o.model })}
                    options={o.efforts.map((e) => ({ value: e, label: e }))}
                    value={o.defaultEffort && o.efforts.includes(o.defaultEffort) ? o.defaultEffort : o.efforts[0]!}
                    onChange={(defaultEffort) => patchModel(o.id, { defaultEffort })}
                  />
                )}
              </td>
              {/* sem confirmação de propósito: a lista pode ser refeita com "Detectar modelos" */}
              <td className="narrow">
                <IconButton
                  variant="ghost"
                  color="red"
                  title={t('Remover do catálogo')}
                  aria-label={t('Remover {model} do catálogo', { model: o.model })}
                  onClick={() => setCatalog(sent.current().filter((x) => x.id !== o.id))}
                >
                  <IconTrash />
                </IconButton>
              </td>
            </tr>
          ))}
          {mine.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                {detectable
                  ? t('Nenhum modelo. Use "Detectar modelos" ou "Novo modelo".')
                  : t('Nenhum modelo. Use "Novo modelo" para cadastrar à mão.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
