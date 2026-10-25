import { useState } from 'react';
import { Text, TextField } from '@radix-ui/themes';
import {
  importedReference,
  leakGroups,
  leakTokens,
  locationKey,
  mergedReference,
  ruleNameFor,
  type ContextLocationResult,
  type ContextOverlap,
  type LeakGroup,
} from '../../../../shared/contextScope';
import { settings } from '../../../commands';
import { t, tn } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';

/** Uma ação da etapa 2, à espera da confirmação da pessoa. */
type Fix = { op: 'import'; file: string } | { op: 'merge'; keep: string; replace: string };

const tokensText = (n: number) => tn(n, '~1 token em todo card', '~{n} tokens em todo card');

/** A sugestão de um grupo de arquivos, pela origem: reduzir (o contexto continua aberto) ou fechar (vai para o board). */
function adviceText(group: LeakGroup): string {
  switch (group.origin.kind) {
    case 'board-reference':
      return t('Já é só a referência que o board deixou: entra em todo card apenas esta linha, e não há mais o que fazer aqui.');
    case 'faz-ai-copy':
      return t(
        'Cópias antigas da skill do fluxo que versões anteriores do Faz AI instalaram: o fluxo agora vem do board, e você pode apagar estas pastas.',
      );
    case 'plugin':
      return t('Vêm do plugin "{plugin}" da ferramenta: se você não o usa, desinstale.', { plugin: group.origin.plugin });
    case 'user-skill':
      return t(
        'Da sua pasta pessoal, entram em todos os projetos. Importe para o board (Harness › Importar) e tire da pasta, ou mova para a pasta de skills do projeto que a usa (isso só limita o vazamento a esse projeto).',
      );
    case 'user-instructions':
      return t('Instruções da sua pasta pessoal, valem para todos os projetos: mova para o projeto o que for só dele.');
    case 'project':
      return t(
        'Do projeto: leve o conteúdo para uma regra do board, que entra só nos cards que a pedirem, e deixe aqui uma referência para quem usa a ferramenta fora do board.',
      );
  }
}

/** "Como desinstalar?": o comando vem do próprio agente, sem lista por ferramenta, e a tela diz que é sugestão dele. */
function Uninstall({ profileId, plugin }: { profileId: string; plugin: string }) {
  const advice = useBoardStore((s) => s.state?.contextAdvice?.[profileId]?.[plugin]);
  const ask = useAction(() => settings.contextAsk(profileId, plugin));
  if (advice?.state === 'running')
    return (
      <p className="row small" role="status">
        <span className="spinner" aria-hidden="true" />
        {t('Perguntando ao agente…')}
      </p>
    );
  if (advice?.state === 'done')
    return advice.command ? (
      <p className="small">
        {t('Sugerido pelo agente, confira antes de rodar:')} <code>{advice.command}</code>
      </p>
    ) : (
      <p className="small muted">{t('O agente não soube dizer o comando: veja a documentação da ferramenta.')}</p>
    );
  return (
    <>
      {advice?.state === 'failed' && (
        <p className="small" role="alert">
          {t(advice.error)}
        </p>
      )}
      <ActionButton
        size="1"
        variant="soft"
        color="gray"
        loading={ask.busy}
        hint={t('Pergunta ao agente o comando que desinstala este plugin. Gasta um pedido da conta dele; o board nunca roda o comando.')}
        onClick={() => void ask.run()}
      >
        {t('Como desinstalar?')}
      </ActionButton>
    </>
  );
}

/** A prévia de uma ação da etapa 2: o que muda em cada arquivo, antes da confirmação. */
function FixPreview({ profileId, fix, onClose }: { profileId: string; fix: Fix; onClose(): void }) {
  const [rule, setRule] = useState(fix.op === 'import' ? ruleNameFor(fix.file) : '');
  const apply = useAction(async () => {
    await settings.contextFix(profileId, fix.op === 'import' ? { op: 'import', file: fix.file, rule: rule.trim() } : fix);
    onClose();
  });
  return (
    <div className="context-fix" role="group" aria-label={t('Prévia da mudança')}>
      {fix.op === 'import' ? (
        <>
          <FormField label={t('Nome da regra')} hint={t('Letras minúsculas, números e hífens.')}>
            {(id) => <TextField.Root id={id} value={rule} onChange={(e) => setRule(e.target.value)} />}
          </FormField>
          <Text as="p" size="1">
            {t('O conteúdo de {file} vira a regra "{rule}" do board (Configurações › Harness), e {file} passa a ter só:', {
              file: fix.file,
              rule: rule.trim(),
            })}
          </Text>
          <pre className="context-fix-preview">{importedReference(rule.trim())}</pre>
          <Text as="p" size="1" color="gray">
            {t(
              'Para a regra entrar nos cards, marque-a em Harness › Regras (sempre ou pelo card). Depois, o teste do contexto roda de novo.',
            )}
          </Text>
        </>
      ) : (
        <>
          <Text as="p" size="1">
            {t('Todas as linhas de {replace} já estão em {keep}: nada se perde. {replace} passa a ter só:', fix)}
          </Text>
          <pre className="context-fix-preview">{mergedReference(fix.keep, fix.replace)}</pre>
          <Text as="p" size="1" color="gray">
            {t('Depois, o teste do contexto roda de novo.')}
          </Text>
        </>
      )}
      {apply.error && <p role="alert">{t(apply.error)}</p>}
      <div className="row end">
        <ActionButton size="1" variant="soft" color="gray" hint={t('Fecha sem mudar nada.')} onClick={onClose}>
          {t('Cancelar')}
        </ActionButton>
        <ActionButton
          size="1"
          loading={apply.busy}
          disabled={fix.op === 'import' && !rule.trim()}
          disabledReason={t('Informe o nome da regra')}
          hint={t('Grava a mudança no projeto. Ela fica no git: dá para desfazer.')}
          onClick={() => void apply.run()}
        >
          {t(fix.op === 'import' ? 'Importar como regra' : 'Juntar')}
        </ActionButton>
      </div>
    </div>
  );
}

/** Os repetidos de um arquivo: com tudo dele no outro, "Juntar" troca o arquivo por uma referência; senão, só avisa. */
function Overlaps({ file, overlaps, onFix }: { file: string; overlaps: ContextOverlap[]; onFix(fix: Fix): void }) {
  const mine = overlaps.filter((o) => o.a === file || o.b === file);
  if (!mine.length) return null;
  return (
    <>
      {mine.map((o) => {
        const other = o.a === file ? o.b : o.a;
        // a fração das linhas DESTE arquivo que estão no outro
        const inOther = o.a === file ? o.aInB : o.bInA;
        const bothProject = ![file, other].some((f) => f.startsWith('~') || f.startsWith('/') || f.startsWith('..'));
        return (
          <div key={other} className="context-overlap small">
            <span>{t('Repete {pct}% das linhas em {other}.', { pct: Math.round(inOther * 100), other })}</span>{' '}
            {inOther === 1 && bothProject ? (
              <ActionButton
                size="1"
                variant="soft"
                hint={t('Troca {file} por uma referência a {other}, que já tem todas as linhas dele.', { file, other })}
                onClick={() => onFix({ op: 'merge', keep: other, replace: file })}
              >
                {t('Juntar em {other}', { other })}
              </ActionButton>
            ) : (
              <span className="muted">{t('Junte à mão o que só existe aqui e deixe uma referência.')}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * O que fazer com um local que entra sozinho: a sugestão de cada grupo de arquivos, o custo, abrir a pasta e "Manter
 * assim". Nos arquivos do projeto, as ações da etapa 2 ("Importar como regra", "Juntar"), sempre com prévia.
 */
export function ContextLeak({ profileId, loc, overlaps }: { profileId: string; loc: ContextLocationResult; overlaps: ContextOverlap[] }) {
  const kept = useBoardStore((s) => !!s.state?.contextKept?.[profileId]?.includes(locationKey(loc)));
  const [fix, setFix] = useState<Fix | null>(null);
  const keep = useAction((on: boolean) => settings.contextKeep(profileId, { path: loc.path, scope: loc.scope }, on));
  const reveal = useAction((path: string) => settings.contextReveal(profileId, path));
  if (kept)
    return (
      <div className="context-leak row small">
        <span className="muted">{t('Mantido por você: entra em todo card.')}</span>
        <ActionButton
          size="1"
          variant="ghost"
          color="gray"
          hint={t('Volta a mostrar a sugestão deste local.')}
          onClick={() => void keep.run(false)}
        >
          {t('Desfazer')}
        </ActionButton>
      </div>
    );
  const total = leakTokens(loc);
  return (
    <div className="context-leak">
      {total > 0 && <span className="muted small">{tokensText(total)}</span>}
      {leakGroups(loc).map((group) => (
        <div key={JSON.stringify(group.origin)} className="context-advice">
          <Text as="p" size="1">
            {adviceText(group)}
            {leakGroups(loc).length > 1 && group.tokens > 0 ? ` (${tokensText(group.tokens)})` : ''}
          </Text>
          {group.origin.kind === 'project' &&
            group.files.map((file) => (
              <div key={file} className="row wrap">
                {group.files.length > 1 && <code className="small">{file}</code>}
                <ActionButton
                  size="1"
                  variant="soft"
                  hint={t('Mostra a prévia: o conteúdo vira uma regra do board e o arquivo fica com uma referência.')}
                  onClick={() => setFix({ op: 'import', file })}
                >
                  {t('Importar como regra')}
                </ActionButton>
                <Overlaps file={file} overlaps={overlaps} onFix={setFix} />
              </div>
            ))}
          <div className="row wrap">
            <ActionButton
              size="1"
              variant="soft"
              color="gray"
              loading={reveal.busy}
              hint={t('Abre a pasta no sistema; o board não muda nada nela.')}
              onClick={() => void reveal.run(group.files[0] ?? loc.path)}
            >
              {t('Abrir pasta')}
            </ActionButton>
            {group.origin.kind === 'plugin' && <Uninstall profileId={profileId} plugin={group.origin.plugin} />}
          </div>
        </div>
      ))}
      {fix && <FixPreview profileId={profileId} fix={fix} onClose={() => setFix(null)} />}
      {(reveal.error || keep.error) && <p role="alert">{t(reveal.error ?? keep.error ?? '')}</p>}
      <div className="row end">
        <ActionButton
          size="1"
          variant="ghost"
          color="gray"
          loading={keep.busy}
          hint={t('Você quer que este local entre em todo card: a sugestão some e ele não conta no resumo.')}
          onClick={() => void keep.run(true)}
        >
          {t('Manter assim')}
        </ActionButton>
      </div>
    </div>
  );
}
