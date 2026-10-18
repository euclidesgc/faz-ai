import { useState } from 'react';
import { Button, Callout } from '@radix-ui/themes';
import type { ArtifactKind } from '../../../../shared/artifacts';
import { IconInfo, IconWarning } from '../../ui';
import { t } from '../../../i18n';

export const ARTIFACT_GUIDANCE: Record<ArtifactKind, { purpose: string; example: string; details: string }> = {
  rule: {
    purpose:
      'Regras ativas entram em toda execução dos cards. Use instruções curtas e gerais: mapa de pastas, comandos de validação, convenções, o que fazer, o que evitar e exceções explícitas. Guarde procedimentos específicos em skills.',
    example:
      'Exemplo: componentes ficam em src/components; regras de negócio em src/domain. Antes de concluir, execute npm run typecheck. Não edite arquivos gerados; a exceção é o gerador em scripts/. Explique o motivo das restrições.',
    details:
      'Descreva convenções verificáveis, limites e exceções. Indique onde encontrar cada parte do projeto e comandos reais de build e testes. Evite repetir instruções e revise conflitos com o fluxo do board.',
  },
  skill: {
    purpose:
      'Skills ensinam uma tarefa reutilizável e específica. No modo Pelo card, só entram quando selecionadas no card; Sempre inclui a skill em toda execução e Desligado impede seu uso. Descreva quando usar, entradas, procedimento e resultado esperado.',
    example:
      'Exemplo: criar uma migração. Use quando alterar o esquema; informe a mudança, siga o padrão em migrations/, inclua reversão e valide com o comando de testes do projeto. Referencie scripts e arquivos de apoio sem repetir as regras gerais.',
    details:
      'Defina entradas obrigatórias, passos, referências, validação e saída esperada. Explique o que fazer se faltar informação ou ocorrer uma falha, e quais ações exigem confirmação.',
  },
  agent: {
    purpose:
      'Subagentes assumem uma responsabilidade especializada quando escolhidos no card, na fase ou como agente padrão. Defina quando delegar, entregáveis, limites, ferramentas e skills necessárias; cadastrar um agente não o torna o executor padrão.',
    example:
      'Exemplo: revisor de segurança. Use para revisar autenticação; entregue achados com arquivo, impacto e evidência. Permita leitura e a skill de revisão; exija confirmação antes de editar ou acessar serviços externos.',
    details:
      'Defina responsabilidade, critérios de conclusão, formato da entrega e quando pedir ajuda. Escolha apenas ferramentas, skills e MCPs necessários. Liste decisões que o agente pode tomar e as que exigem aprovação.',
  },
  mcp: {
    purpose:
      'MCPs conectam ferramentas e serviços externos ao board. Pelo card disponibiliza o servidor apenas nos cards que o selecionarem; Sempre o disponibiliza em toda execução; Desligado bloqueia o acesso. Conectar um servidor não autoriza qualquer ação externa.',
    example:
      'Exemplo: conectar um serviço de documentação para consultar referências durante uma implementação. Revise comando ou URL, credenciais e permissões antes de disponibilizá-lo aos cards.',
    details: 'Informe o transporte e os dados de conexão. Revise permissões e credenciais e defina em quais cards o servidor será usado.',
  },
};

export function ArtifactHelp({ kind }: { kind: ArtifactKind }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(`faz-ai.harness.warning.${kind}`) === 'hidden';
    } catch {
      return false;
    }
  });
  const toggle = (hide: boolean) => {
    setHidden(hide);
    try {
      localStorage.setItem(`faz-ai.harness.warning.${kind}`, hide ? 'hidden' : 'visible');
    } catch {
      /* Storage indisponível: mantém nesta sessão. */
    }
  };
  return (
    <div className="artifact-help">
      <p className="muted small">
        {t(ARTIFACT_GUIDANCE[kind].purpose)}{' '}
        {hidden && (
          <Button size="1" variant="ghost" aria-label={t('Exibir aviso sobre os artefatos')} onClick={() => toggle(false)}>
            <IconInfo />
          </Button>
        )}
      </p>
      {!hidden && (
        <Callout.Root color="amber" size="1" className="artifact-help-notice">
          <Callout.Icon>
            <IconWarning />
          </Callout.Icon>
          <div className="artifact-help-content">
            <Callout.Text>
              {kind === 'rule'
                ? t(
                    'As regras entram desligadas: escritas para outro contexto, elas podem conflitar com o fluxo e as definições do board (fases, aprovação, uso do MCP). Leia o texto de cada uma antes de ativar; regra ativa entra em toda execução.',
                  )
                : t(
                    'Os artefatos não são usados só por estarem na biblioteca. Revise seu conteúdo e defina quais usar e em que contexto. Skills e MCPs novos ficam Pelo card; agentes precisam ser escolhidos para a execução.',
                  )}
            </Callout.Text>
            <Button size="1" variant="outline" className="artifact-help-dismiss" onClick={() => toggle(true)}>
              {t('Fechar e não exibir mais')}
            </Button>
          </div>
        </Callout.Root>
      )}
    </div>
  );
}
