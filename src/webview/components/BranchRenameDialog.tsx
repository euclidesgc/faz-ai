import { useEffect, useState } from 'react';
import type { BranchRenamePending, RenameKind, RenameOutcome, RenameStep } from '../../shared/branchRename';
import { useBoardStore } from '../store/boardStore';
import { gitRename } from '../commands';
import { useAction } from '../useAction';
import { isWeb } from '../vscode';
import { t } from '../i18n';
import { rich } from '../i18n/rich';
import { Button } from './ui';
import { CopyCommand } from './RequirementsBanner';

type Ref = Pick<BranchRenamePending, 'kind' | 'from' | 'to'>;

/** A mesma chave do aviso do editor: o pedido é o mesmo enquanto o tipo, o nome de origem e o novo forem os mesmos. */
const keyOf = (p: Ref): string => `${p.kind}:${p.from}>${p.to}`;

function stepLabel(step: RenameStep): string {
  switch (step) {
    case 'fetch':
      return t('atualizar as referências do origin');
    case 'remote':
      return t('renomear no GitHub');
    case 'local':
      return t('renomear a branch local');
    case 'upstream':
      return t('ajustar o upstream');
    case 'head':
      return t('apontar o origin/HEAD para a nova');
  }
}

const steps = (list: RenameStep[]): string => list.map(stepLabel).join(', ');

/** Os comandos de cada clone, com copiar; a linha que começa com `#` é um aviso, não um comando. */
function Commands({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <>
      <p>{title}</p>
      <ol className="env-commands">
        {lines.map((line) => (
          <li key={line}>
            {line.startsWith('#') ? <span className="small muted">{line.replace(/^#\s*/, '')}</span> : <CopyCommand command={line} />}
          </li>
        ))}
      </ol>
    </>
  );
}

/** O resultado da renomeação: o que mudou, o que falta e os comandos prontos. */
function Result({ r }: { r: RenameOutcome }) {
  const { from, to } = r.request;
  const names = { from: <code>{from}</code>, to: <code>{to}</code> };
  return (
    <>
      {r.status === 'done' && <p>{rich('A branch {from} agora se chama {to} ({steps}).', { ...names, steps: steps(r.done) })}</p>}
      {r.status === 'nothing' && (
        <p>{rich('Nada a renomear: {to} já existe ou {from} não existe mais. O board passa a usar {to}.', names)}</p>
      )}
      {r.status === 'manual' && (
        <p>
          {rich('O board não alterou o repositório nem o remoto ({reason}). Para renomear {from} para {to}, rode:', {
            ...names,
            reason: r.reason ?? t('sem o gh'),
          })}
        </p>
      )}
      {r.status === 'failed' && (
        <>
          <p role="alert">
            {rich('A renomeação parou em "{step}": {error}', {
              step: r.failed ? stepLabel(r.failed.step) : t('um passo'),
              error: r.failed?.error ?? t('erro'),
            })}
          </p>
          <p>{r.done.length ? t('Já feito: {steps}.', { steps: steps(r.done) }) : t('Nada foi alterado.')}</p>
        </>
      )}
      <Commands
        title={r.status === 'failed' ? t('O que falta, neste clone:') : t('Neste clone, rode:')}
        lines={r.status === 'done' || r.status === 'nothing' ? [] : r.commands}
      />
      <Commands title={t('Nos outros clones do repositório, rode:')} lines={r.otherClones} />
    </>
  );
}

/**
 * Aviso de renomeação da principal ou da develop no navegador (#466/#498): quando o board tem um pedido de
 * renomeação guardado, pergunta Renomear ou Desfazer; depois mostra o resultado, com os comandos para copiar.
 * Fechar sem escolher (botão ou Esc) não envia nada: o pedido continua e o Diagnóstico segue avisando. No editor
 * quem pergunta é o modal da extensão, então aqui nada aparece.
 */
export function BranchRenameDialog() {
  const pending = useBoardStore((s) => s.state?.branchRenames ?? []);
  const result = useBoardStore((s) => s.state?.branchRenameResult ?? null);
  // pedidos de que a pessoa fechou o aviso nesta sessão: não voltam até um pedido novo ou recarregar a página
  const [closed, setClosed] = useState<string[]>([]);
  const action = useAction((p: Ref, a: 'confirm' | 'undo' | 'dismiss') => gitRename.resolve(p, a));

  const current: BranchRenamePending | null = result ? null : (pending.find((p) => !closed.includes(keyOf(p))) ?? null);
  const resultOpen = result !== null && !closed.includes(`result:${keyOf(result.request)}`);
  const shown = !isWeb ? null : resultOpen ? 'result' : current ? 'ask' : null;
  const target: Ref | null = shown === 'result' ? result!.request : shown === 'ask' ? current : null;

  // fechar sem agir: a pergunta some; o resultado é dispensado no host para o aviso do editor não repeti-lo
  const close = () => {
    if (!target) return;
    if (shown === 'result') {
      setClosed((c) => [...c, `result:${keyOf(target)}`]);
      void action.run(target, 'dismiss');
    } else setClosed((c) => [...c, keyOf(target)]);
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, target?.kind, target?.from, target?.to]);

  if (!shown || !target) return null;
  const kind: RenameKind = target.kind;
  const names = { from: <code>{target.from}</code>, to: <code>{target.to}</code> };
  const title =
    shown === 'result' ? t('Resultado da renomeação') : kind === 'main' ? t('Renomear a branch principal?') : t('Renomear a develop?');

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="branch-rename-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="branch-rename-title">{title}</h2>
        {shown === 'ask' ? (
          <>
            <p>{rich('A branch {from} passa a se chamar {to}. O nome novo já está nas configurações.', names)}</p>
            <p>{t('Para o repositório ficar coerente, o board vai:')}</p>
            <ul>
              <li>{rich('renomear a branch no GitHub, com o <code>gh</code> (instalado e autenticado);')}</li>
              <li>{t('renomear a branch no clone local e ajustar o upstream;')}</li>
              {kind === 'main' && <li>{rich('apontar o <code>origin/HEAD</code> para a nova.', {})}</li>}
            </ul>
            <p>
              {t(
                'Sem o gh, fora do GitHub ou sem permissão, o board não mexe no remoto e mostra os comandos prontos. Não muda: workflows de CI, regras de proteção, a branch padrão do GitHub e os clones de outras pessoas.',
              )}
            </p>
            <p>{rich('Desfazer volta o nome para {from} sem tocar o repositório.', names)}</p>
          </>
        ) : (
          <Result r={result!} />
        )}
        {action.error && (
          <p role="alert" className="error">
            {action.error}
          </p>
        )}
        <div className="row end wrap">
          {shown === 'ask' ? (
            <>
              <Button disabled={action.busy} onClick={close}>
                {t('Fechar')}
              </Button>
              <Button disabled={action.busy} onClick={() => void action.run(target, 'undo')}>
                {t('Desfazer')}
              </Button>
              <Button variant="primary" autoFocus loading={action.busy} onClick={() => void action.run(target, 'confirm')}>
                {t('Renomear')}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={action.busy} onClick={close}>
                {t('Fechar')}
              </Button>
              {result!.status === 'failed' && (
                <Button variant="primary" autoFocus loading={action.busy} onClick={() => void action.run(target, 'confirm')}>
                  {t('Renomear de novo')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
