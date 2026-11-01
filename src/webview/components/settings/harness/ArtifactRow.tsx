import { Badge, Switch } from '@radix-ui/themes';
import { linkedCards } from '../../../../shared/artifactLibrary';
import {
  activeUsage,
  artifactLocation,
  isActive,
  selectableOfKind,
  type ArtifactKind,
  type BoardArtifact,
} from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, DeleteButton, IconDuplicate, IconEdit } from '../../ui';
import { DefaultAgentBadge, DeleteAgentButton, MakeDefaultButton, useDefaultAgent } from './AgentsToolbar';
import { ArtifactBadges, RestoreAgentButton, UpdateFromOriginButton } from './ArtifactStatus';
import { UsageSelect } from './UsageSelect';
import { t, tn } from '../../../i18n';

/** O que o selo de estado diz, por tipo: ativo quer dizer coisas diferentes numa regra, numa skill, num agente e num MCP. */
function statusText(a: BoardArtifact): string {
  const on = isActive(a);
  switch (a.kind) {
    case 'rule':
      return on ? t('Ativa · em todo contexto') : t('Inativa · oculta no board');
    case 'skill':
      return on ? t('Ativa · vinculável a cards') : t('Inativa · oculta no board');
    case 'agent':
      return on ? t('Ativo · vinculável a cards') : t('Inativo · oculto no board');
    case 'mcp':
      return !on ? t('Inativo · oculto no board') : a.usage === 'always' ? t('Ativo · sempre') : t('Ativo · pelo card');
  }
}

/** O texto de origem da linha: de onde veio a cópia, ou por que ela não vale. */
function originText(a: BoardArtifact): string | null {
  if (a.generated) return t('gerada pelo board');
  if (a.missing) return t('origem ausente na cópia');
  return a.origin ? t('importado de {origin}', { origin: a.origin }) : null;
}

/** O que o artefato cobra do contexto e a quem ele serve: tokens, pasta, tools e cards vinculados. */
function metaParts(a: BoardArtifact, linked: number): string[] {
  const parts: string[] = [];
  if (a.size !== undefined && a.kind !== 'mcp') parts.push(t('~{n} tokens', { n: Math.ceil(a.size / 4) }));
  if (a.kind === 'skill' && a.folder) parts.push(a.folder);
  if (a.tools?.length) parts.push(a.tools.join(', '));
  if (a.kind === 'skill' || a.kind === 'agent') parts.push(tn(linked, '1 card vinculado', '{n} cards vinculados'));
  return parts;
}

/**
 * Uma linha da biblioteca: interruptor de ativo, nome, versão, estado, descrição, meta em fonte mono e as ações.
 * Editar e duplicar abrem o modal da aba (quem monta decide); o MCP abre o editor da própria aba.
 */
export function ArtifactRow({
  artifact: a,
  kind,
  onEdit,
  onDuplicate,
}: {
  artifact: BoardArtifact;
  kind: ArtifactKind;
  onEdit: () => void;
  /** ausente = a linha não duplica (MCP) */
  onDuplicate?: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const defaultAgent = useDefaultAgent();
  const active = isActive(a);
  const generatedSkill = a.kind === 'skill' && a.generated === true;
  const isDefaultAgent = a.kind === 'agent' && a.name === defaultAgent;
  const origin = originText(a);
  const mcp = a.mcpCredential;
  const toggle = useAction((on: boolean) =>
    harness.setSelection([{ kind: selectableOfKind(a.kind), location: artifactLocation(a) }], on ? activeUsage(a.kind, a.usage) : 'off'),
  );
  const meta = metaParts(a, linkedCards(state, a).length);

  return (
    <li className={`item-row artifact-row${active ? '' : ' inactive'}`}>
      <span className="item-check">
        {!generatedSkill && (
          <Switch
            size="1"
            checked={active}
            disabled={toggle.busy || isDefaultAgent}
            title={
              isDefaultAgent
                ? t('Este é o agente padrão das instruções: torne outro o padrão antes de desativar.')
                : active
                  ? t('Desativa: sai do contexto e some das escolhas do board.')
                  : t('Ativa: entra no contexto, no modo de cada tipo.')
            }
            aria-label={t('Ativo: {name}', { name: a.name })}
            onCheckedChange={(on) => void toggle.run(on)}
          />
        )}
      </span>
      <div className="item-main">
        <div className="item-title">
          {generatedSkill ? (
            <button
              type="button"
              className="path-link item-name"
              title={t('Abre o texto só para leitura')}
              onClick={() => useBoardStore.getState().openHarnessFile({ kind: 'skill', name: a.name })}
            >
              {a.name}
            </button>
          ) : (
            <span className="item-name">{a.name}</span>
          )}
          {a.version && (
            <span className="muted small" title={t('Versão do artefato no board')}>
              {t('v{n}', { n: a.version })}
            </span>
          )}
          {!generatedSkill && (
            <Badge color={active ? 'green' : 'gray'} variant="soft">
              {statusText(a)}
            </Badge>
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
        </div>
        {(a.description || a.mcpSummary) && (
          <p className="item-hint" title={a.description}>
            {a.description || a.mcpSummary}
          </p>
        )}
        {meta.length > 0 && <p className="artifact-meta">{meta.join(' · ')}</p>}
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
        {generatedSkill && (
          <Badge
            color="gray"
            variant="outline"
            title={t('O board entrega esta skill pelo get_skill, com o texto desta versão da extensão.')}
          >
            {t('Entregue pelo board')}
          </Badge>
        )}
        {a.kind === 'mcp' && active && <UsageSelect artifact={a} />}
        {a.kind === 'agent' && active && <MakeDefaultButton name={a.name} />}
        <UpdateFromOriginButton artifact={a} />
        <RestoreAgentButton artifact={a} />
        {!generatedSkill && (
          <ActionButton
            variant="ghost"
            size="1"
            aria-label={t('Editar: {name}', { name: a.name })}
            hint={kind === 'mcp' ? t('Abre o editor logo abaixo da linha.') : t('Abre o formulário de edição.')}
            onClick={onEdit}
          >
            <IconEdit /> {t('Editar')}
          </ActionButton>
        )}
        {!generatedSkill && onDuplicate && (
          <ActionButton
            variant="ghost"
            size="1"
            aria-label={t('Duplicar: {name}', { name: a.name })}
            hint={t('Abre um formulário novo com os dados desta cópia; nada é gravado até salvar.')}
            onClick={onDuplicate}
          >
            <IconDuplicate /> {t('Duplicar')}
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
    </li>
  );
}
