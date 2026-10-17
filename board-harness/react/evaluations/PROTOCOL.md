# Avaliação do catálogo

## Estado e limites

`cases.json` contém 160 definições: 96 casos de capacidade (32 skills × três modos), 32 casos próximos de não ativação e 32 de manutenção. Todos começam como `not_run`. São cenários e critérios para preparar avaliações; não são 160 aplicações/fixtures executáveis prontas nem resultados de agentes aprovados.

A validação estrutural e a integração com descoberta/ranking estão registradas em [VALIDATION.md](VALIDATION.md). Elas não provam qualidade de implementação, segurança completa ou economia de tokens. As avaliações comportamentais abaixo exigem código e ambiente concretos, produzidos em diretório isolado conforme o caso.

## Preparar um caso

1. Escolha uma aplicação React + Vite pequena ou um snapshot de aplicação existente; registre commit, versões, contrato e comandos reais.
2. Prepare os `required_artifacts` descritos no caso: arquivos relevantes, consumidores e contratos aprovados. Use dados fictícios; não use serviços/credenciais reais.
3. Em revisão, introduza o defeito descrito em `fixture_setup`. Em manutenção, demonstre primeiro o defeito e o comportamento a preservar. Não entregue a preparação, a expectativa nem a resposta pretendida ao agente avaliado.
4. Execute com apenas a skill atribuída e os artefatos necessários. Para seleção, apresente metadados do catálogo e pedido, sem informar antecipadamente a skill esperada.
5. Para casos negativos, peça a mesma entrega próxima e observe se o agente seleciona o dono correto. Não exigir que o matcher lexical suprima qualquer resultado semelhante: as sugestões não são o executor da tarefa.

Não interpretar os campos `input`, `expected` ou `fixture_setup` como parte do prompt ao copiar o JSON inteiro. O pedido (`request`) e artefatos brutos são o material do agente; expectativas ficam com o avaliador.

## Evidência por modo

| Modo         | Resultado observado                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Projetar     | Decisão aplicável aos arquivos reais, contratos consumíveis e verificação; nenhuma implementação por um pedido só de desenho. |
| Implementar  | Mudança funcional no escopo, comportamento comprovado pelos checks pertinentes e contratos preservados.                       |
| Revisar      | Achado localizado e reproduzível, consequência e correção sugerida; nenhum arquivo alterado sem pedido.                       |
| Manutenção   | Defeito corrigido sem substituir arquitetura, bibliotecas ou convenções fora da entrega.                                      |
| Não ativação | Responsabilidade próxima reconhecida, sem carregar especialista irrelevante como dono principal.                              |

Não pontuar presença de cabeçalhos ou repetição literal das instruções. Verifique artefatos e resultados. Se o agente acrescentar regra fora de sua responsabilidade, confira se veio do contrato consumido ou foi inventada.

## Piloto e progressão

Comece por `react-module-boundaries`, `react-ui-state`, `react-query-cache` e `react-mutations`. Rode seus três modos, casos próximos e manutenção. Corrija ambiguidades demonstradas antes de ampliar a avaliação às demais. As 32 skills estão disponíveis para essa avaliação incremental; sua criação não significa aprovação antecipada do piloto.

Execute depois os casos individuais restantes e o conjunto integrado abaixo em uma aplicação nova e em outra existente. Em cada passo use somente o conhecimento atribuído e os contratos gerados nas etapas anteriores.

## Cenário integrado: listagem filtrável e edição

Entrada: serviço documentado/simulado de discussões com `id`, `teamId`, `title`, `status` e paginação. Contratos de sessão/negócio vêm do produto; não criar backend. Navegação e dependências usam as versões do projeto de avaliação.

| Etapa              | Skills e modo                                      | Artefato / observação                                                 |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------------------- |
| Fronteiras         | module-boundaries / projetar                       | Mapa das features e imports; composição entre features em app.        |
| Dados externos     | api-contracts / projetar e implementar             | DTO/schema/mapper e incompatibilidades relevantes.                    |
| Rede controlada    | http-client + api-mocks / implementar              | Fetchers e handlers fiéis, com sucesso, vazio e falha.                |
| Leitura            | query-cache / projetar e implementar               | Chaves por time/filtros/página reutilizadas em hook/loader.           |
| Filtros navegáveis | url-state / implementar                            | Parsing, recarga e histórico; preservação de outros parâmetros.       |
| Estado visual      | ui-state / implementar                             | Abertura/seleção no escopo correto, reset na troca de recurso.        |
| Formulário         | forms + component-contracts / implementar          | Rascunho, erro por campo e API de componentes sem copiar cache.       |
| Escrita            | mutations / implementar                            | Detalhe/listas reconciliados; erro e concorrência não perdem dados.   |
| Tela               | page-composition + styling / implementar           | Estados e apresentação previstos sem duplicar regras/consultas.       |
| Verificação        | integration-tests + api-mocks / implementar        | Editar e observar atualização; falha não descarta rascunho.           |
| Navegador          | e2e-tests + accessibility / implementar ou revisar | URL, recarga, teclado/foco e persistência simulada coerente.          |
| Revisão dirigida   | responsáveis afetados / revisar                    | Evidência por contrato; não carregar todo o catálogo automaticamente. |

Os nomes na tabela omitem o prefixo `react-` apenas por legibilidade. Modos podem ser execuções distintas; não ler todas as referências no mesmo contexto. Agrupe entregas pequenas se forem coerentes e respeite dependências dos artefatos, sem inventar campos/hierarquia do board.

## Cenários integrados adicionais

1. **Aplicação nova:** preencher contrato, configurar entrada/providers, primeira rota e feature. Verificar dev, tipos e build/preview locais.
2. **Sessão e acesso:** restauração, expiração, logout com requisição pendente e outra conta; decisão por papel/propriedade e 403.
3. **Falhas:** rede indisponível, validação remota e seção com erro de render; recuperação sem três mensagens para o mesmo evento.
4. **Refatoração:** mover utilitário compartilhado sem criar ciclos ou alterar jornada.
5. **Incidente de dados:** reproduzir cache incorreto entre filtros, corrigir identidade da consulta e confirmar leitura após escrita.
6. **Dependência:** avaliar aviso oficial e atualizar cadeia afetada sem alteração ampla da stack.
7. **Execução local:** build/preview, recurso estático e navegação; registrar requisito externo de fallback sem configurar deploy.
8. **Segurança:** Markdown/URL não confiáveis, dados no bundle/storage e limpeza na troca de conta, apenas superfícies presentes.
9. **Desempenho:** baseline de carga e interação, intervenção e comparação controlada, sem alterar contratos por ganho aparente.
10. **Localização e metadados:** se habilitados, idioma/plural/data/timezone e atualização do head ao trocar de rota.

## Registrar resultado e custo

Mantenha resultados separados dos casos de entrada. Para cada execução, registre identificador, modelo/versão, commit da aplicação e da biblioteca, modo, artefatos fornecidos, arquivos efetivamente lidos, decisões, checks executados, achados do avaliador e resultado (aprovado, reprovado ou inconclusivo com motivo).

Contabilize tokens de entrada/saída quando a ferramenta os oferecer, incluindo nomes/descrições disponíveis, instruções comuns, skill, referências e contexto adicional. Palavras/bytes são aproximações, não contagem de tokens. Compare com baseline usando mesmo modelo, mesma tarefa e artefatos equivalentes; compare também retrabalho, seleção incorreta e violações de contrato.

Economia só está demonstrada se reduzir custo sem perder precisão observada. Se duas skills forem sempre necessárias juntas e não entregarem trabalho independente, reavaliar sua divisão. Não aumentar o catálogo para melhorar métricas de contagem de arquivos.
