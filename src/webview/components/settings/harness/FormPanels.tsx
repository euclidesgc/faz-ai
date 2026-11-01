import { isActive, type BoardArtifact } from '../../../../shared/artifacts';
import { missingTools, nativeTools, supportsToolList, type NeutralTool } from '../../../../shared/artifactTools';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';
import { IconCheck, IconWarning } from '../../ui';
import { useActiveMcpServers } from './ToolGrid';

/** O nome com que uma skill é citada num agente: `pasta/nome` ou só o nome na raiz. */
export const skillRef = (a: Pick<BoardArtifact, 'name' | 'folder'>): string => (a.folder ? `${a.folder}/${a.name}` : a.name);

/** Separa o frontmatter (`---` no topo) do corpo. */
export function splitDocument(src: string): { meta: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  return m ? { meta: m[0], body: src.slice(m[0].length) } : { meta: '', body: src };
}

/** O frontmatter do board gerado ao vivo, só para leitura. */
export function FrontmatterPanel({ text }: { text: string }) {
  return (
    <section className="form-panel" aria-label={t('Frontmatter do board')}>
      <h4>{t('Frontmatter do board')}</h4>
      <pre className="form-panel-code">{text}</pre>
    </section>
  );
}

/**
 * Compatibilidade entre skills e agentes: a skill pede tools, o agente concede. Na skill, lista os agentes ativos;
 * no agente, as skills padrão dele. "compatível" ou "sem shell, network", com o ícone de cada um.
 */
export function CompatPanel({
  kind,
  tools,
  skills,
  self,
}: {
  kind: 'skill' | 'agent';
  tools: readonly NeutralTool[];
  /** agente: as skills padrão marcadas */
  skills?: readonly string[];
  /** o próprio artefato (fica fora da lista) */
  self?: string;
}) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const rows =
    kind === 'skill'
      ? artifacts
          .filter((a) => a.kind === 'agent' && isActive(a) && a.name !== self)
          .map((a) => ({ key: a.id, label: a.name, missing: missingTools(a.tools ?? [], tools) }))
      : (skills ?? []).map((ref) => {
          const s = artifacts.find((a) => a.kind === 'skill' && skillRef(a) === ref);
          return { key: ref, label: ref, missing: missingTools(tools, s?.tools ?? []) };
        });
  return (
    <section className="form-panel" aria-label={t('Compatibilidade')}>
      <h4>{t('Compatibilidade')}</h4>
      <p className="muted small">
        {kind === 'skill'
          ? t('A skill pede estas tools; o agente precisa concedê-las.')
          : t('As skills padrão pedem tools; este agente precisa concedê-las.')}
      </p>
      {rows.length === 0 ? (
        <p className="muted small">{kind === 'skill' ? t('Nenhum agente ativo.') : t('Nenhuma skill padrão.')}</p>
      ) : (
        <ul className="compat-list">
          {rows.map((r) => (
            <li key={r.key} className={r.missing.length ? 'compat-bad' : 'compat-ok'}>
              <span>{r.label}</span>
              <span className="compat-state">
                {r.missing.length ? <IconWarning aria-hidden /> : <IconCheck aria-hidden />}
                {r.missing.length ? `${t('sem')} ${r.missing.join(', ')}` : t('compatível')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** O que vai para a ferramenta do projeto na exportação: `allowed-tools` na skill, `tools` no agente. */
export function ExportPreview({ kind, tools }: { kind: 'skill' | 'agent'; tools: readonly NeutralTool[] }) {
  const tool = useBoardStore((s) => s.state!.board.aiTool);
  const servers = useActiveMcpServers();
  const names = supportsToolList(tool) ? nativeTools(tool, tools, servers) : null;
  return (
    <section className="form-panel" aria-label={t('Prévia da exportação')}>
      <h4>{t('Prévia da exportação')}</h4>
      {names === null ? (
        <p className="muted small">{t('O campo é omitido nesta ferramenta.')}</p>
      ) : names.length === 0 ? (
        <p className="muted small">{t('Sem tools marcadas: o campo é omitido.')}</p>
      ) : (
        <pre className="form-panel-code">{kind === 'skill' ? `allowed-tools: ${names.join(' ')}` : `tools: ${names.join(', ')}`}</pre>
      )}
    </section>
  );
}
