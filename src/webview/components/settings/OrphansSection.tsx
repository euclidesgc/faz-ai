import { Badge, Callout, Card } from '@radix-ui/themes';
import type { OrphanBlocker, OrphanItem, OrphanProof, OrphanSituation } from '../../../shared/orphans';
import { useBoardStore } from '../../store/boardStore';
import { orphans } from '../../commands';
import { formatDateTime, t, tn } from '../../i18n';
import { useAction } from '../../useAction';
import { ActionButton, IconWarning } from '../ui';
import { SectionHeader } from './SectionHeader';

/** Em que pé está a história dona do item, como a tela diz. */
const SITUATION: Record<OrphanSituation, string> = {
  merged: 'história com merge feito',
  cancelled: 'história cancelada',
  done: 'história concluída',
  archived: 'história arquivada',
  deleted: 'história na lixeira',
  unknown: 'sem história no board',
  missing: 'a pasta não existe mais',
};

const PROOF: Record<OrphanProof, string> = {
  clean: 'sem arquivos alterados',
  'no-unique-commits': 'sem commits só dela',
  'merge-commit': 'já mesclada na base',
};

/** O que impede a limpeza automática de um item, com os números que ele traz. */
function blockerText(b: OrphanBlocker, item: OrphanItem): string {
  if (b === 'dirty') return tn(item.dirtyFiles, '{n} arquivo não commitado', '{n} arquivos não commitados');
  if (b === 'unique') return tn(item.uniqueCommits, '{n} commit só nesta branch', '{n} commits só nesta branch');
  if (b === 'unknown-card') return t('nenhuma história do board tem este número');
  return t('branch em uso por uma worktree');
}

/** O texto da confirmação: o que se perde, com os mesmos números que o host revalida. */
function lossMessage(item: OrphanItem): string {
  const losses = [
    item.dirtyFiles > 0 ? tn(item.dirtyFiles, '{n} arquivo não commitado', '{n} arquivos não commitados') : null,
    item.uniqueCommits > 0 ? tn(item.uniqueCommits, '{n} commit só nesta branch', '{n} commits só nesta branch') : null,
  ].filter((x): x is string => x !== null);
  const what = item.kind === 'worktree' ? t('A worktree') : t('A branch');
  return losses.length
    ? t('{what} {ref} será removida e isto se perde, sem volta: {losses}.', { what, ref: item.ref, losses: losses.join(' e ') })
    : t('{what} {ref} será removida e não dá para desfazer.', { what, ref: item.ref });
}

function OrphanRow({ item, failure }: { item: OrphanItem; failure: string | undefined }) {
  const ask = useBoardStore((s) => s.ask);
  const clean = useAction((acceptLoss?: { dirtyFiles: number; uniqueCommits: number }) => orphans.clean(item.id, acceptLoss));
  const decision = item.verdict === 'decision';

  const onClean = () => {
    if (!decision) {
      void clean.run();
      return;
    }
    // só ao confirmar a webview manda `acceptLoss`; o host revalida os números contra o que está no disco
    ask({
      title: t('Limpar mesmo assim?'),
      message: lossMessage(item),
      confirmLabel: t('Limpar mesmo assim'),
      danger: true,
      onConfirm: () => void clean.run({ dirtyFiles: item.dirtyFiles, uniqueCommits: item.uniqueCommits }),
    });
  };

  return (
    <tr>
      <td>
        <span className="muted small">{item.kind === 'worktree' ? t('Worktree') : t('Branch')}</span>
        <br />
        <code>{item.ref}</code>
        {item.kind === 'worktree' && item.branch && (
          <>
            <br />
            <span className="muted small">
              {t('branch')} <code>{item.branch}</code>
            </span>
          </>
        )}
      </td>
      <td>{item.cardNumber !== null ? `#${item.cardNumber}` : '—'}</td>
      <td>{t(SITUATION[item.situation])}</td>
      <td>
        {decision ? (
          <Badge color="amber" variant="soft">
            {t('Precisa de decisão')}
          </Badge>
        ) : (
          <Badge color="gray" variant="soft">
            {t('Segura')}
          </Badge>
        )}
        <div className="muted small">
          {decision ? item.blockers.map((b) => blockerText(b, item)).join('; ') : item.proof ? t(PROOF[item.proof]) : ''}
        </div>
        {failure && (
          <Callout.Root color="amber" size="1" role="note" aria-label={t('Não removido')}>
            <Callout.Icon>
              <IconWarning />
            </Callout.Icon>
            <Callout.Text>{t('Não removido: {erro}', { erro: failure })}</Callout.Text>
          </Callout.Root>
        )}
      </td>
      <td>
        <ActionButton
          size="1"
          variant="soft"
          color={decision ? 'amber' : 'gray'}
          loading={clean.busy}
          aria-label={t('Limpar {ref}', { ref: item.ref })}
          hint={decision ? t('Pede confirmação antes de remover, porque algo se perde.') : t('Remove; não há nada a perder.')}
          onClick={onClean}
        >
          {t('Limpar')}
        </ActionButton>
      </td>
    </tr>
  );
}

/**
 * Seção "Branches e worktrees órfãs" da tela Git (#465): o relatório do host (`BoardState.orphans`), a limpeza
 * de uma, a de todas as seguras e a nova varredura. A tela não decide o que é seguro: só mostra o veredito.
 */
export function OrphansSection() {
  const report = useBoardStore((s) => s.state)!.orphans;
  const scan = useAction(() => orphans.scan());
  const cleanSafe = useAction(() => orphans.cleanSafe());
  const safe = report.items.filter((i) => i.verdict === 'safe').length;

  return (
    <>
      <SectionHeader
        title={t('Branches e worktrees órfãs')}
        count={report.items.length}
        actions={
          <>
            <ActionButton
              variant="soft"
              color="gray"
              loading={scan.busy}
              hint={t('Confere de novo as branches e worktrees criadas pelo board.')}
              onClick={() => void scan.run()}
            >
              {t('Verificar de novo')}
            </ActionButton>
            <ActionButton
              loading={cleanSafe.busy}
              disabled={safe === 0}
              disabledReason={t('Nenhuma órfã segura para limpar.')}
              hint={t('Remove todas as órfãs seguras de uma vez; as que dependem de decisão ficam.')}
              onClick={() => void cleanSafe.run()}
            >
              {t('Limpar todas as seguras')}
            </ActionButton>
          </>
        }
      >
        {t(
          'Branches e worktrees que o board criou e cuja história já terminou ou não existe mais. As seguras não perdem nada e o board as limpa sozinho; as que dependem de decisão têm arquivos ou commits que só existem ali.',
        )}
      </SectionHeader>
      <Card className="form-card" aria-label={t('Branches e worktrees órfãs')}>
        {report.items.length === 0 ? (
          <p className="muted" role="status">
            {t('Nenhuma branch ou worktree órfã.')}
            {report.scannedAt !== null && ` ${t('Verificado em {quando}.', { quando: formatDateTime(report.scannedAt) })}`}
          </p>
        ) : (
          <table className="table" aria-label={t('Branches e worktrees órfãs')}>
            <thead>
              <tr>
                <th>{t('Item')}</th>
                <th>{t('História')}</th>
                <th>{t('Situação')}</th>
                <th>{t('Veredito')}</th>
                <th aria-label={t('Ações')} />
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <OrphanRow key={item.id} item={item} failure={report.failed[item.id]} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
