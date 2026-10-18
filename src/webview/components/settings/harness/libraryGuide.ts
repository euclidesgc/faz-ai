import type { ArtifactKind } from '../../../../shared/artifacts';

export interface GuideSection {
  title: string;
  hint: string;
  example: string;
}

/** Exemplos editáveis: nunca são incluídos no artefato sem escolha do usuário. */
export const LIBRARY_GUIDE: Record<ArtifactKind, GuideSection[]> = {
  rule: [
    {
      title: 'Projeto e objetivo',
      hint: 'Escreva de forma bem resumida qual é o objetivo do projeto.',
      example:
        'Extensão para VS Code e Cursor, escrita em TypeScript, que exibe um board Kanban e conduz as atividades pelas fases com ajuda de IA.',
    },
    {
      title: 'Mapa do código',
      hint: 'Indique onde encontrar cada responsabilidade. Cite caminhos reais e explique o que fica em cada pasta.',
      example:
        '- src/extension: host, persistência e servidor MCP.\n- src/shared: tipos e regras puras compartilhados, sem dependência do editor.\n- src/webview: interface React e traduções.\n- test/: testes de lógica e de interface.',
    },
    {
      title: 'Comandos e validação',
      hint: 'Informe os comandos exatos para preparar o ambiente, rodar testes e validar a entrega, na ordem correta. Se houver um comando próprio, como full_coverage, explique como chamá-lo, seus pré-requisitos e quando ele é obrigatório.',
      example:
        '1. Antes dos testes, execute npm run build para atualizar os artefatos usados pela suíte.\n2. Durante o trabalho, rode npx vitest run <arquivos tocados>.\n3. Antes de entregar, execute npm run typecheck e npm test.\n4. Se o projeto tiver um script de cobertura, informe aqui a chamada exata e o mínimo exigido.\n5. Em caso de falha, corrija o problema antes de concluir.',
    },
    {
      title: 'Convenções',
      hint: 'Descreva padrões verificáveis: idioma, componentes, traduções e contratos. Prefira instruções específicas a “siga boas práticas”.',
      example:
        '- Escreva comentários e testes em português.\n- Use os componentes e tokens visuais existentes.\n- Texto de interface usa t() e recebe tradução em inglês.\n- Ao alterar mensagens entre host e interface, atualize os dois lados juntos.',
    },
    {
      title: 'Regras inegociáveis',
      hint: 'Liste as obrigações e proibições que devem valer em qualquer alteração. Seja explícito sobre o que nunca fazer e os critérios obrigatórios para concluir. Se uma exigência não puder ser cumprida, a IA deve informar o impedimento.',
      example:
        '- Nunca edite migrações já publicadas; crie uma nova.\n- Nunca apague nem sobrescreva alterações locais do usuário.\n- Não conclua com falhas nos testes relacionados à alteração.\n- Nunca inclua credenciais no código ou no repositório.\n- Se não puder cumprir uma exigência, informe o impedimento antes de prosseguir.',
    },
    {
      title: 'Limites e exceções',
      hint: 'Explique o que preservar, o que evitar e quando há exceção. Inclua o motivo quando ele ajudar a tomar decisões.',
      example:
        '- Preserve alterações locais do usuário.\n- Não edite arquivos gerados; altere o gerador em scripts/.\n- Não edite migrações publicadas: crie uma nova para preservar bancos existentes.\n- Peça confirmação antes de publicar ou executar ações fora do pedido.',
    },
  ],
  skill: [
    {
      title: 'Quando usar',
      hint: 'Dê um nome à tarefa repetida e descreva o pedido que deve acionar esta skill.',
      example: 'Use esta skill quando uma alteração exigir uma nova migração de banco de dados.',
    },
    {
      title: 'Entradas e referências',
      hint: 'Liste as informações necessárias e os arquivos que devem ser consultados antes de começar.',
      example:
        '- Entrada: mudança de esquema desejada e compatibilidade esperada.\n- Consulte o schema atual e as migrações anteriores em src/extension/db/.\n- Se a compatibilidade não estiver definida, esclareça antes de alterar o banco.',
    },
    {
      title: 'Procedimento',
      hint: 'Escreva uma sequência que possa ser repetida. Deixe regras gerais no AGENTS.md e detalhe aqui apenas esta tarefa.',
      example:
        '1. Leia a versão atual do schema.\n2. Adicione uma migração, preservando as já publicadas.\n3. Atualize a versão do schema e os tipos afetados.\n4. Cubra a migração de um banco existente com um teste.',
    },
    {
      title: 'Resultado e validação',
      hint: 'Defina como conferir o resultado, o que entregar e como agir em caso de falha.',
      example:
        '- Execute os testes de migração e npm run typecheck.\n- Entregue a migração, o teste e um resumo do impacto.\n- Se um banco existente não migrar, interrompa a entrega e informe o erro.',
    },
  ],
  agent: [
    {
      title: 'Responsabilidade',
      hint: 'Descreva a especialidade e quando o board deve escolher este subagente.',
      example: 'Revisor de segurança: avalia alterações em autenticação, autorização e tratamento de dados sensíveis antes da entrega.',
    },
    {
      title: 'Escopo e limites',
      hint: 'Diga o que pode fazer sozinho e quando deve pedir ajuda. Ferramentas, skills e MCPs serão escolhidos na revisão.',
      example:
        '- Leia o diff, os testes e o código relacionado.\n- Não altere arquivos durante a revisão.\n- Não acesse serviços externos sem autorização.\n- Se faltar contexto, registre a dúvida em vez de presumir uma falha.',
    },
    {
      title: 'Como trabalhar',
      hint: 'Oriente a análise: fontes, sequência e critérios. Procedimentos reutilizáveis podem ficar em skills.',
      example:
        '1. Leia as regras do projeto e o objetivo do card.\n2. Verifique entradas, permissões e exposição de dados nas alterações.\n3. Compare o comportamento com os testes.\n4. Relate apenas problemas sustentados por evidência.',
    },
    {
      title: 'Entrega e conclusão',
      hint: 'Defina o formato da resposta e o que caracteriza uma revisão concluída.',
      example:
        '- Para cada achado, informe arquivo, linha, impacto e evidência.\n- Separe problemas confirmados de dúvidas.\n- Conclua com os riscos restantes e os testes verificados.\n- Se não houver achados, diga o que foi revisado.',
    },
  ],
  mcp: [],
};
