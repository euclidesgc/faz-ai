import { Button, Callout } from '@radix-ui/themes';
import { useBoardStore } from '../../../store/boardStore';
import { IconInfo } from '../../ui';
import { t } from '../../../i18n';
import { rich } from '../../../i18n/rich';

/**
 * O aviso de como usar o Harness: para que a tela serve, por que o board trabalha assim e por onde
 * começar. Aparece até a pessoa dispensar ("Entendi, não mostrar de novo"; fica guardado por pessoa,
 * como o aviso do modo autônomo) e volta pelo "Como funciona" do cabeçalho.
 */
export function HarnessIntro() {
  const seen = useBoardStore((s) => s.harnessIntroSeen);
  const setSeen = useBoardStore((s) => s.setHarnessIntroSeen);
  if (seen) return null;
  return (
    <Callout.Root color="indigo" size="2" className="harness-intro" role="note" aria-label={t('Como usar o Harness')}>
      <Callout.Icon>
        <IconInfo />
      </Callout.Icon>
      <div>
        <strong>{t('Como usar o Harness')}</strong>
        <ul>
          <li>
            {rich(
              '<b>Para que serve.</b> Toda execução do board parte de contexto vazio. A <b>Biblioteca do board</b> guarda regras, skills, subagentes e MCPs para qualquer ferramenta conectada.',
            )}
          </li>
          <li>
            {rich(
              '<b>Por que assim.</b> Menos contexto por execução é resposta mais rápida, mais barata e mais precisa. O planejamento de cada card escolhe o mínimo entre o que está no Board.',
            )}
          </li>
          <li>
            {rich(
              '<b>Por onde começar.</b> 1) Importe uma pasta e escolha os artefatos na prévia por tipo. 2) Crie artefatos nas abas, com o assistente guiado ou com IA. 3) Revise as regras e escolha quando cada artefato entra no contexto.',
            )}
          </li>
        </ul>
        <Button size="1" variant="soft" onClick={() => setSeen(true)}>
          {t('Entendi, não mostrar de novo')}
        </Button>
      </div>
    </Callout.Root>
  );
}
