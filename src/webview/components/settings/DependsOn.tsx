import { Button, Text } from '@radix-ui/themes';
import { useBoardStore } from '../../store/boardStore';
import { ui } from '../../commands';
import { isWeb } from '../../vscode';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

export type DependsOnTarget = { kind: 'board'; section: string } | { kind: 'ideSettings'; key: string };

export interface DependsOnProps {
  /** nome da opção de que depende, ex.: "Modo do Git". Texto puro, sem markup. */
  label: string;
  /** estado atual, já formatado pela tela de origem (o mesmo rótulo visível ali). Omitir quando não houver um estado único a mostrar. */
  state?: string;
  /** false = destaque (laranja/aviso); normalmente o controle do chamador também está desabilitado com a mesma condição. */
  satisfied: boolean;
  target: DependsOnTarget;
  /** onde a opção de destino está, para o rótulo acessível do link (ex.: "em Harness de IA"). */
  targetHint: string;
}

/**
 * Linha discreta sob um campo que só funciona por causa de outro: "Depende de **X** (agora: Y) → abrir".
 * Não desabilita nada por conta própria — cada tela aplica o próprio `disabled` usando a mesma condição
 * passada aqui em `satisfied`. Ver SPEC.md (#183) para a arquitetura completa.
 */
export function DependsOn({ label, state, satisfied, target, targetHint }: DependsOnProps) {
  const hideLink = isWeb && target.kind === 'ideSettings';

  const onOpen = () => {
    if (target.kind === 'board') useBoardStore.getState().goToSection(target.section);
    else ui.openIdeSettings(target.key);
  };

  return (
    <Text as="p" size="1" color="gray" className={satisfied ? 'depends-on' : 'depends-on depends-on-unmet'}>
      {state ? rich('Depende de <b>{label}</b> (agora: {state})', { label, state }) : rich('Depende de <b>{label}</b>', { label })}
      {!hideLink && (
        <>
          {' '}
          <Button variant="ghost" size="1" aria-label={t('Abrir {label}, {hint}', { label, hint: targetHint })} onClick={onOpen}>
            {t('abrir')}
          </Button>
        </>
      )}
    </Text>
  );
}
