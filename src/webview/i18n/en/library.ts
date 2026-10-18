export const library: Record<string, string> = {
  'Ações em massa de subagentes': 'Bulk subagent actions',
  'Ações em massa de MCPs': 'Bulk MCP actions',
  'Selecionar subagentes visíveis': 'Select visible subagents',
  'Selecionar MCPs visíveis': 'Select visible MCPs',
  'Selecionar subagente: {name}': 'Select subagent: {name}',
  'Selecionar MCP: {name}': 'Select MCP: {name}',
  'Exclui os artefatos selecionados da biblioteca. Os arquivos de origem serão preservados.':
    'Deletes the selected artifacts from the library. Source files are preserved.',
  'Excluir {n} artefatos da biblioteca?': 'Delete {n} artifacts from the library?',
  'Sem descrição cadastrada. Use Editar para explicar o que este MCP oferece e quando usá-lo.':
    'No description provided. Use Edit to explain what this MCP offers and when to use it.',
  'Explique o que este MCP oferece e quando usá-lo. Exemplo: consulta issues e pull requests do GitHub para acompanhar o desenvolvimento.':
    'Explain what this MCP offers and when to use it. Example: queries GitHub issues and pull requests to track development.',

  'Crie, importe e gerencie os artefatos deste board. Cada aba reúne um tipo, disponível com qualquer ferramenta de IA conectada.':
    "Create, import and manage this board's artifacts. Each tab holds one type, available to any connected AI tool.",
  'A <b>Biblioteca do board</b> reúne os artefatos disponíveis em qualquer ferramenta. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão. Crie e importe regras, skills, subagentes e MCPs diretamente na biblioteca.':
    'The <b>Board library</b> holds artifacts available to any tool. <b>Tool and execution</b> selects the AI, permissions and default agent. Create and import rules, skills, subagents and MCPs directly in the library.',
  'Armazenamento da biblioteca': 'Library storage',
  'Cria um artefato nesta aba.': 'Creates an artifact in this tab.',
  'Responda às perguntas e revise o conteúdo antes de salvar.': 'Answer the questions and review the content before saving.',
  'Assistente guiado': 'Guided assistant',
  'A IA analisa o projeto e cria sugestões na biblioteca. Acompanhe pela conversa do board.':
    'AI analyzes the project and creates suggestions in the library. Follow along in the board chat.',
  'Gerar com base no projeto': 'Generate from project',
  'Aguarde a resposta da IA. Acompanhe pela conversa do board.': 'Wait for the AI response. Follow along in the board chat.',
  'Conecte sua ferramenta ao MCP faz-ai uma vez. Os servidores desta aba são acessados por list_board_mcp_tools e call_board_mcp_tool, sem copiar configurações entre ferramentas.':
    'Connect your tool to the faz-ai MCP once. Servers in this tab are accessed through list_board_mcp_tools and call_board_mcp_tool, without copying settings between tools.',
  'Nenhum artefato nesta aba. Crie um aqui ou importe uma pasta para começar.':
    'No artifacts in this tab. Create one here or import a folder to get started.',
  'Edita o conteúdo e as configurações deste artefato.': "Edits this artifact's content and settings.",
  'Excluir "{name}" da biblioteca?': 'Delete "{name}" from the library?',
  'A cópia do board será excluída. A origem será preservada.': 'The board copy will be deleted. The source will be preserved.',
  '<b>Para que serve.</b> Toda execução do board parte de contexto vazio. A <b>Biblioteca do board</b> guarda regras, skills, subagentes e MCPs para qualquer ferramenta conectada.':
    '<b>What it does.</b> Every board run starts with an empty context. The <b>Board library</b> stores rules, skills, subagents and MCPs for any connected tool.',
  '<b>Por onde começar.</b> 1) Importe uma pasta e escolha os artefatos na prévia por tipo. 2) Crie artefatos nas abas, com o assistente guiado ou com IA. 3) Revise as regras e escolha quando cada artefato entra no contexto.':
    '<b>Where to start.</b> 1) Import a folder and select artifacts in the preview grouped by type. 2) Create artifacts in their tabs, using the guided assistant or AI. 3) Review the rules and choose when each artifact enters the context.',
  'Cole uma definição por vez ou importe o arquivo JSON pela pasta.':
    'Paste one definition at a time or import the JSON file from a folder.',
  'Convenções e limites': 'Conventions and limits',
  Verificação: 'Validation',
  'Editor da biblioteca': 'Library editor',
  'Qual tarefa este artefato deve orientar e quando deve ser usado?': 'What task should this artifact guide and when should it be used?',
  Objetivo: 'Goal',
  'Detectado no projeto: {text}': 'Detected in project: {text}',
  'Quais convenções e limites devem ser respeitados?': 'Which conventions and limits should be followed?',
  'Outras instruções': 'Other instructions',
  Conteúdo: 'Content',
  'Editar JSON diretamente': 'Edit JSON directly',
  'Definição JSON do MCP': 'MCP JSON definition',
  'Argumentos (lista JSON)': 'Arguments (JSON array)',
  'O board conecta servidores stdio e HTTP e disponibiliza suas ferramentas pelo MCP faz-ai. Variáveis e cabeçalhos ficam na configuração local; use o JSON para informá-los.':
    'The board connects to stdio and HTTP servers and exposes their tools through the faz-ai MCP. Variables and headers stay in local settings; enter them in the JSON.',
  'Ferramentas permitidas': 'Allowed tools',
  'A regra será salva desligada. Revise e ative quando estiver pronta.':
    'The rule will be saved as off. Review it and enable it when ready.',
  'Preencha nome e conteúdo.': 'Enter a name and content.',
  'Salva apenas na biblioteca deste board.': "Saves only in this board's library.",
  'Salvar na biblioteca': 'Save to library',
  'Importar artefatos de uma pasta': 'Import artifacts from a folder',
  'Escolha uma pasta de projeto ou coleção. O board identifica regras, skills, subagentes e MCPs e copia os itens selecionados para suas abas.':
    'Choose a project folder or collection. The board detects rules, skills, subagents and MCPs and copies selected items into their tabs.',
  'Pasta de origem': 'Source folder',
  'Caminho completo da pasta de origem': 'Full path to the source folder',
  'Procura os quatro tipos de artefato nesta pasta.': 'Scans this folder for all four artifact types.',
  'Informe a pasta de origem.': 'Enter the source folder.',
  'Examinar pasta': 'Scan folder',
  'Escolhe a pasta pelo gerenciador de arquivos.': 'Selects a folder using the file manager.',
  'Escolher pasta': 'Choose folder',
  'Nenhum artefato reconhecido nesta pasta.': 'No recognized artifacts in this folder.',
  'Selecione ao menos um artefato.': 'Select at least one artifact.',
  'Copia os itens selecionados para a biblioteca do board.': 'Copies selected items to the board library.',
  'Importar selecionados ({n})': 'Import selected ({n})',
  'Importação concluída. Os artefatos estão nas abas correspondentes.': 'Import complete. Artifacts are in their corresponding tabs.',
  'A ferramenta selecionada define a execução e os modelos dos cards. Regras, skills, subagentes e MCPs são gerenciados na biblioteca do board, compartilhada entre as ferramentas.':
    'The selected tool determines execution and card models. Rules, skills, subagents and MCPs are managed in the board library, shared across tools.',
  'Aguarde a resposta da IA.': 'Wait for the AI response.',
  'Objetivo e uso': 'Goal and usage',
  'Revisar e salvar': 'Review and save',
  'Executar os testes do projeto': "Run the project's tests",
  'Seguir os padrões existentes': 'Follow existing conventions',
  'Preservar alterações do usuário': "Preserve the user's changes",
  'Validar antes de concluir': 'Validate before finishing',
  Subagentes: 'Subagents',
  Comandos: 'Commands',
  Rede: 'Network',
  Leitura: 'Read',
  Edição: 'Edit',
  'Vazio usa o modelo do card ou da sessão.': 'Leave empty to use the card or session model.',
  'Quais regras gerais devem orientar as alterações neste projeto?': 'Which general rules should guide changes in this project?',
  'Qual tarefa repetida esta skill deve ensinar e quando deve ser usada?':
    'Which repeated task should this skill teach and when should it be used?',
  'Qual responsabilidade este subagente terá e quando deve ser escolhido?':
    'What will this subagent be responsible for and when should it be chosen?',
  'Quais são as entradas, os passos e o resultado esperado da tarefa?': 'What are the inputs, steps and expected outcome of the task?',
  'O que o subagente deve entregar e quais decisões ele não pode tomar sozinho?':
    'What should the subagent deliver and which decisions require help?',
  'Marca todos os artefatos da prévia.': 'Selects all artifacts in the preview.',
  'Desmarca todos os artefatos da prévia.': 'Deselects all artifacts in the preview.',
  'Selecione os artefatos para importar.': 'Select artifacts to import.',
  'Releia a pasta antes de importar.': 'Scan the folder again before importing.',
  'Já existe "{name}" neste tipo. Renomeie ou edite o artefato existente.':
    '"{name}" already exists in this type. Rename or edit the existing artifact.',
  'Há nomes repetidos no mesmo tipo. Selecione apenas uma origem para cada nome.':
    'Names are repeated within a type. Select only one source per name.',
  'Artefato não encontrado.': 'Artifact not found.',
  'Tipo de artefato inválido.': 'Invalid artifact type.',
  'Nome de artefato inválido.': 'Invalid artifact name.',
  'Nome inválido. Use letras minúsculas, números e hífens.': 'Invalid name. Use lowercase letters, numbers and hyphens.',
  'O nome faz-ai é reservado ao MCP do board.': 'The name faz-ai is reserved for the board MCP.',
  'Já existe um artefato com este nome. Edite o existente ou escolha outro nome.':
    'An artifact with this name already exists. Edit it or choose another name.',
  'O nome e o tipo de um artefato existente não podem mudar.': 'The name and type of an existing artifact cannot change.',
  'Arquivo maior que 512 KB.': 'File larger than 512 KB.',
  'Definição MCP inválida.': 'Invalid MCP definition.',
  'args deve ser uma lista de textos.': 'args must be an array of strings.',
  'Informe command e args ou uma URL HTTP do servidor MCP.': 'Enter command and args or an HTTP URL for the MCP server.',
  '{key} deve conter pares de nome e texto.': '{key} must contain name and string pairs.',
  'Configuração de subagente inválida.': 'Invalid subagent configuration.',
  'Informe o caminho completo de uma pasta.': 'Enter the full path to a folder.',
  'Informe o caminho da pasta.': 'Enter the folder path.',
  'Exibir aviso sobre os artefatos': 'Show artifact warning',
  'Os artefatos não são usados só por estarem na biblioteca. Revise seu conteúdo e defina quais usar e em que contexto. Skills e MCPs novos ficam Pelo card; agentes precisam ser escolhidos para a execução.':
    'Artifacts are not used simply because they are in the library. Review their content and choose which ones to use and in what context. New skills and MCPs use Per card; agents must be selected for execution.',
  'Fechar e não exibir mais': 'Close and do not show again',
  'Seleciona uma nova pasta para a biblioteca.': 'Select a new folder for the library.',
  'Selecionar pasta': 'Select folder',
  'Etapas do assistente': 'Wizard steps',
  'Lendo o contexto do projeto…': 'Reading project context…',
  'As opções abaixo acrescentam instruções ao rascunho. São sugestões opcionais: selecione apenas as que se aplicam e detalhe comandos e exceções no texto. Nada é executado ao marcá-las.':
    'The options below add instructions to the draft. They are optional suggestions: select only those that apply and specify commands and exceptions in the text. Selecting them does not execute anything.',
  'Selecionar pasta da biblioteca': 'Select library folder',
  'Escolha uma pasta no computador que executa o board. Para criar um novo destino, acrescente o nome no campo Pasta da biblioteca e salve.':
    'Choose a folder on the computer running the board. To create a new destination, append its name in the Library folder field and save.',
  'Navegar para a pasta': 'Browse to folder',
  'Lista as subpastas deste caminho.': 'List subfolders at this path.',
  'Pasta acima': 'Parent folder',
  'Usar esta pasta': 'Use this folder',
  'Escolha uma pasta de um projeto ou coleção em qualquer lugar. O board identifica regras, skills, subagentes e MCPs e faz uma cópia para biblioteca apenas dos itens que você selecionar.':
    'Choose any project or collection folder. The board identifies rules, skills, subagents, and MCPs and copies only the items you select into the library.',
  'Tipos de artefatos para importar': 'Artifact types to import',
  'Filtrar {type}': 'Filter {type}',
  'Filtrar por nome ou descrição…': 'Filter by name or description…',
  'Nenhum artefato encontrado nesta aba.': 'No artifacts found in this tab.',
  '{n} artefatos importados com sucesso.': '{n} artifacts imported successfully.',
  '{n} artefatos com o mesmo nome já existiam na biblioteca e não foram importados:':
    '{n} artifacts with the same name already existed in the library and were not imported:',
  'Deseja repetir o processo e sobrescrever estes artefatos pelos novos que estão sendo importados agora?':
    'Would you like to repeat the process and overwrite these artifacts with the new ones being imported?',
  'ATENÇÃO: Esse processo é irreversível.': 'WARNING: This process is irreversible.',
  'Substitui somente os artefatos ignorados nesta importação.': 'Replace only the artifacts skipped in this import.',
  'Sobrescrever artefatos existentes?': 'Overwrite existing artifacts?',
  Sobrescrever: 'Overwrite',
  'Sobrescrever artefatos ignorados': 'Overwrite skipped artifacts',
  'Verificar as entradas antes de começar': 'Check inputs before starting',
  'Validar o resultado da tarefa': 'Validate the task result',
  'Explicar como lidar com falhas': 'Explain how to handle failures',
  'Entregar um relatório com evidências': 'Deliver a report with evidence',
  'Pedir aprovação para ações fora do escopo': 'Request approval for actions outside the scope',
  'Abra um projeto existente para gerar artefatos.': 'Open an existing project to generate artifacts.',
  'Regras ativas entram em toda execução dos cards. Use instruções curtas e gerais: mapa de pastas, comandos de validação, convenções, o que fazer, o que evitar e exceções explícitas. Guarde procedimentos específicos em skills.':
    'Active rules enter every card execution. Use short, general instructions: folder map, validation commands, conventions, what to do, what to avoid, and explicit exceptions. Keep specific procedures in skills.',
  'Exemplo: componentes ficam em src/components; regras de negócio em src/domain. Antes de concluir, execute npm run typecheck. Não edite arquivos gerados; a exceção é o gerador em scripts/. Explique o motivo das restrições.':
    'Example: components live in src/components; business rules in src/domain. Before finishing, run npm run typecheck. Do not edit generated files; the exception is the generator in scripts/. Explain the reason for restrictions.',
  'Descreva convenções verificáveis, limites e exceções. Indique onde encontrar cada parte do projeto e comandos reais de build e testes. Evite repetir instruções e revise conflitos com o fluxo do board.':
    'Describe verifiable conventions, boundaries, and exceptions. Explain where to find each part of the project and provide real build and test commands. Avoid repeating instructions and review conflicts with the board workflow.',
  'Skills ensinam uma tarefa reutilizável e específica. No modo Pelo card, só entram quando selecionadas no card; Sempre inclui a skill em toda execução e Desligado impede seu uso. Descreva quando usar, entradas, procedimento e resultado esperado.':
    'Skills teach a specific, reusable task. In Per card mode, they enter only when selected on the card; Always includes the skill in every execution, and Off prevents its use. Describe when to use it, inputs, procedure, and expected result.',
  'Exemplo: criar uma migração. Use quando alterar o esquema; informe a mudança, siga o padrão em migrations/, inclua reversão e valide com o comando de testes do projeto. Referencie scripts e arquivos de apoio sem repetir as regras gerais.':
    'Example: create a migration. Use it when changing the schema; describe the change, follow the pattern in migrations/, include rollback, and validate with the project test command. Reference scripts and supporting files without repeating general rules.',
  'Defina entradas obrigatórias, passos, referências, validação e saída esperada. Explique o que fazer se faltar informação ou ocorrer uma falha, e quais ações exigem confirmação.':
    'Define required inputs, steps, references, validation, and expected output. Explain what to do when information is missing or a failure occurs, and which actions require confirmation.',
  'Subagentes assumem uma responsabilidade especializada quando escolhidos no card, na fase ou como agente padrão. Defina quando delegar, entregáveis, limites, ferramentas e skills necessárias; cadastrar um agente não o torna o executor padrão.':
    'Subagents take on a specialized responsibility when selected on the card, phase, or as the default agent. Define when to delegate, deliverables, boundaries, tools, and required skills; registering an agent does not make it the default executor.',
  'Exemplo: revisor de segurança. Use para revisar autenticação; entregue achados com arquivo, impacto e evidência. Permita leitura e a skill de revisão; exija confirmação antes de editar ou acessar serviços externos.':
    'Example: security reviewer. Use it to review authentication; deliver findings with file, impact, and evidence. Allow reading and the review skill; require confirmation before editing or accessing external services.',
  'Defina responsabilidade, critérios de conclusão, formato da entrega e quando pedir ajuda. Escolha apenas ferramentas, skills e MCPs necessários. Liste decisões que o agente pode tomar e as que exigem aprovação.':
    'Define responsibility, completion criteria, delivery format, and when to ask for help. Choose only the required tools, skills, and MCPs. List decisions the agent can make and those requiring approval.',
  'MCPs conectam ferramentas e serviços externos ao board. Pelo card disponibiliza o servidor apenas nos cards que o selecionarem; Sempre o disponibiliza em toda execução; Desligado bloqueia o acesso. Conectar um servidor não autoriza qualquer ação externa.':
    'MCPs connect external tools and services to the board. Per card makes the server available only to cards that select it; Always makes it available in every execution; Off blocks access. Connecting a server does not authorize every external action.',
  'Exemplo: conectar um serviço de documentação para consultar referências durante uma implementação. Revise comando ou URL, credenciais e permissões antes de disponibilizá-lo aos cards.':
    'Example: connect a documentation service to look up references during implementation. Review the command or URL, credentials, and permissions before making it available to cards.',
  'Informe o transporte e os dados de conexão. Revise permissões e credenciais e defina em quais cards o servidor será usado.':
    'Provide the transport and connection details. Review permissions and credentials, and define which cards will use the server.',
  'Uso e entradas': 'Usage and inputs',
  'Procedimento e validação': 'Procedure and validation',
  Responsabilidade: 'Responsibility',
  'Escopo e entrega': 'Scope and deliverables',
  'Projeto e objetivo': 'Project and goal',
  'Apresente o produto, a linguagem e o que a IA precisa saber em qualquer card. Uma ou duas frases bastam.':
    'Introduce the product, language and what AI needs to know for any card. One or two sentences are enough.',
  'Extensão de kanban para VS Code e Cursor, escrita em TypeScript. O board conduz a IA pelas fases de cada história.':
    'A kanban extension for VS Code and Cursor, written in TypeScript. The board guides AI through each story phase.',
  'Mapa do código': 'Code map',
  'Indique onde encontrar cada responsabilidade. Cite caminhos reais e explique o que fica em cada pasta.':
    'Show where to find each responsibility. Give real paths and explain what each folder contains.',
  '- src/extension: host, persistência e servidor MCP.\n- src/shared: tipos e regras puras compartilhados, sem dependência do editor.\n- src/webview: interface React e traduções.\n- test/: testes de lógica e de interface.':
    '- src/extension: host, persistence and MCP server.\n- src/shared: shared types and pure rules, without editor dependencies.\n- src/webview: React interface and translations.\n- test/: logic and interface tests.',
  Validação: 'Validation',
  'Liste os comandos reais para conferir uma alteração e quando executá-los. Não precisa listar todos os scripts.':
    'List real commands for checking a change and when to run them. You do not need every script.',
  '- Durante o trabalho, rode npx vitest run <arquivos tocados>.\n- Antes de entregar, rode npm run typecheck e npm run build.\n- Corrija falhas relacionadas à alteração antes de concluir.':
    '- While working, run npx vitest run <changed files>.\n- Before delivery, run npm run typecheck and npm run build.\n- Fix failures related to the change before finishing.',
  Convenções: 'Conventions',
  'Descreva padrões verificáveis: idioma, componentes, traduções e contratos. Prefira instruções específicas a “siga boas práticas”.':
    'Describe verifiable patterns: language, components, translations and contracts. Prefer specific instructions to “follow best practices”.',
  '- Escreva comentários e testes em português.\n- Use os componentes e tokens visuais existentes.\n- Texto de interface usa t() e recebe tradução em inglês.\n- Ao alterar mensagens entre host e interface, atualize os dois lados juntos.':
    '- Write comments and tests in Portuguese.\n- Use existing components and visual tokens.\n- Interface text uses t() and gets an English translation.\n- When changing host/interface messages, update both sides together.',
  'Limites e exceções': 'Limits and exceptions',
  'Explique o que preservar, o que evitar e quando há exceção. Inclua o motivo quando ele ajudar a tomar decisões.':
    'Explain what to preserve, avoid and when an exception applies. Include the reason when it helps decisions.',
  '- Preserve alterações locais do usuário.\n- Não edite arquivos gerados; altere o gerador em scripts/.\n- Não edite migrações publicadas: crie uma nova para preservar bancos existentes.\n- Peça confirmação antes de publicar ou executar ações fora do pedido.':
    '- Preserve the user’s local changes.\n- Do not edit generated files; change the generator in scripts/.\n- Do not edit released migrations: create a new one to preserve existing databases.\n- Ask before publishing or taking actions outside the request.',
  'Quando usar': 'When to use',
  'Dê um nome à tarefa repetida e descreva o pedido que deve acionar esta skill.':
    'Name the repeated task and describe the request that should trigger this skill.',
  'Use esta skill quando uma alteração exigir uma nova migração de banco de dados.':
    'Use this skill when a change requires a new database migration.',
  'Entradas e referências': 'Inputs and references',
  'Liste as informações necessárias e os arquivos que devem ser consultados antes de começar.':
    'List the required information and files to consult before starting.',
  '- Entrada: mudança de esquema desejada e compatibilidade esperada.\n- Consulte o schema atual e as migrações anteriores em src/extension/db/.\n- Se a compatibilidade não estiver definida, esclareça antes de alterar o banco.':
    '- Input: desired schema change and expected compatibility.\n- Read the current schema and previous migrations in src/extension/db/.\n- If compatibility is unclear, clarify before changing the database.',
  Procedimento: 'Procedure',
  'Escreva uma sequência que possa ser repetida. Deixe regras gerais no AGENTS.md e detalhe aqui apenas esta tarefa.':
    'Write a repeatable sequence. Keep general rules in AGENTS.md and detail only this task here.',
  '1. Leia a versão atual do schema.\n2. Adicione uma migração, preservando as já publicadas.\n3. Atualize a versão do schema e os tipos afetados.\n4. Cubra a migração de um banco existente com um teste.':
    '1. Read the current schema version.\n2. Add a migration, preserving released migrations.\n3. Update the schema version and affected types.\n4. Test migration of an existing database.',
  'Resultado e validação': 'Result and validation',
  'Defina como conferir o resultado, o que entregar e como agir em caso de falha.':
    'Define how to check the result, what to deliver and how to handle failure.',
  '- Execute os testes de migração e npm run typecheck.\n- Entregue a migração, o teste e um resumo do impacto.\n- Se um banco existente não migrar, interrompa a entrega e informe o erro.':
    '- Run migration tests and npm run typecheck.\n- Deliver the migration, test and an impact summary.\n- If an existing database cannot migrate, stop delivery and report the error.',
  'Descreva a especialidade e quando o board deve escolher este subagente.':
    'Describe the specialty and when the board should choose this subagent.',
  'Revisor de segurança: avalia alterações em autenticação, autorização e tratamento de dados sensíveis antes da entrega.':
    'Security reviewer: evaluates authentication, authorization and sensitive data changes before delivery.',
  'Escopo e limites': 'Scope and limits',
  'Diga o que pode fazer sozinho e quando deve pedir ajuda. Ferramentas, skills e MCPs serão escolhidos na revisão.':
    'Say what it can do independently and when to ask for help. Tools, skills and MCPs are selected at review.',
  '- Leia o diff, os testes e o código relacionado.\n- Não altere arquivos durante a revisão.\n- Não acesse serviços externos sem autorização.\n- Se faltar contexto, registre a dúvida em vez de presumir uma falha.':
    '- Read the diff, tests and related code.\n- Do not change files during review.\n- Do not access external services without authorization.\n- If context is missing, record the question rather than assuming a defect.',
  'Como trabalhar': 'How to work',
  'Oriente a análise: fontes, sequência e critérios. Procedimentos reutilizáveis podem ficar em skills.':
    'Guide the analysis: sources, sequence and criteria. Reusable procedures can live in skills.',
  '1. Leia as regras do projeto e o objetivo do card.\n2. Verifique entradas, permissões e exposição de dados nas alterações.\n3. Compare o comportamento com os testes.\n4. Relate apenas problemas sustentados por evidência.':
    '1. Read project rules and the card goal.\n2. Check inputs, permissions and data exposure in the changes.\n3. Compare behavior with tests.\n4. Report only problems supported by evidence.',
  'Entrega e conclusão': 'Delivery and completion',
  'Defina o formato da resposta e o que caracteriza uma revisão concluída.': 'Define the response format and what makes a review complete.',
  '- Para cada achado, informe arquivo, linha, impacto e evidência.\n- Separe problemas confirmados de dúvidas.\n- Conclua com os riscos restantes e os testes verificados.\n- Se não houver achados, diga o que foi revisado.':
    '- For each finding, give file, line, impact and evidence.\n- Separate confirmed issues from questions.\n- Finish with remaining risks and checked tests.\n- If there are no findings, state what was reviewed.',
  'A pasta informada será o local onde os artefatos serão guardados.': 'Artifacts will be stored in the folder specified here.',
  'Você pode mudar a localização dessa pasta. Ao clicar em Salvar pasta, a biblioteca será transferida para o novo local.':
    'You can change this folder’s location. When you click Save folder, the library will be transferred to the new location.',
  'Escreva com suas palavras ou use o exemplo e adapte ao seu projeto. As etapas após a primeira são opcionais.':
    'Write in your own words or use the example and adapt it to your project. Steps after the first are optional.',
  'Exemplo para adaptar': 'Example to adapt',
  'Usar este exemplo': 'Use this example',
  'Pular esta parte': 'Skip this part',
  'Revise o Markdown montado com suas respostas. Ajuste o nome e o conteúdo antes de salvar.':
    'Review the Markdown assembled from your answers. Adjust the name and content before saving.',
  '{instruction}\n\nExemplo:\n{example}': '{instruction}\n\nExample:\n{example}',
  'Escreva de forma bem resumida qual é o objetivo do projeto.': 'Briefly describe the goal of the project.',
  'Extensão para VS Code e Cursor, escrita em TypeScript, que exibe um board Kanban e conduz as atividades pelas fases com ajuda de IA.':
    'An extension for VS Code and Cursor, written in TypeScript, that displays a Kanban board and guides activities through phases with AI assistance.',
  'Comandos e validação': 'Commands and validation',
  'Informe os comandos exatos para preparar o ambiente, rodar testes e validar a entrega, na ordem correta. Se houver um comando próprio, como full_coverage, explique como chamá-lo, seus pré-requisitos e quando ele é obrigatório.':
    'Give the exact commands to prepare the environment, run tests and validate delivery, in order. If there is a custom command such as full_coverage, explain how to invoke it, its prerequisites and when it is required.',
  '1. Antes dos testes, execute npm run build para atualizar os artefatos usados pela suíte.\n2. Durante o trabalho, rode npx vitest run <arquivos tocados>.\n3. Antes de entregar, execute npm run typecheck e npm test.\n4. Se o projeto tiver um script de cobertura, informe aqui a chamada exata e o mínimo exigido.\n5. Em caso de falha, corrija o problema antes de concluir.':
    '1. Before testing, run npm run build to update artifacts used by the suite.\n2. While working, run npx vitest run <changed files>.\n3. Before delivery, run npm run typecheck and npm test.\n4. If the project has a coverage script, enter the exact invocation and required minimum here.\n5. If a check fails, fix the issue before finishing.',
  'Regras inegociáveis': 'Non-negotiable rules',
  'Liste as obrigações e proibições que devem valer em qualquer alteração. Seja explícito sobre o que nunca fazer e os critérios obrigatórios para concluir. Se uma exigência não puder ser cumprida, a IA deve informar o impedimento.':
    'List requirements and prohibitions that apply to every change. Be explicit about what must never be done and the required completion criteria. If a requirement cannot be met, AI must report the blocker.',
  '- Nunca edite migrações já publicadas; crie uma nova.\n- Nunca apague nem sobrescreva alterações locais do usuário.\n- Não conclua com falhas nos testes relacionados à alteração.\n- Nunca inclua credenciais no código ou no repositório.\n- Se não puder cumprir uma exigência, informe o impedimento antes de prosseguir.':
    '- Never edit released migrations; create a new one.\n- Never delete or overwrite the user’s local changes.\n- Do not finish with failing tests related to the change.\n- Never include credentials in code or in the repository.\n- If you cannot meet a requirement, report the blocker before proceeding.',
  'Ações em massa de skills': 'Bulk skill actions',
  'Selecionar skills visíveis': 'Select visible skills',
  '{n} selecionados': '{n} selected',
  'Exclui as skills selecionadas da biblioteca. Os arquivos de origem serão preservados.':
    'Deletes the selected skills from the library. Source files will be preserved.',
  'Excluir {n} skills da biblioteca?': 'Delete {n} skills from the library?',
  'As cópias selecionadas serão excluídas. As origens serão preservadas. Esta ação não pode ser desfeita.':
    'Selected copies will be deleted. Sources will be preserved. This action cannot be undone.',
  'Excluir selecionadas': 'Delete selected',
  'Selecionar skill: {name}': 'Select skill: {name}',
  'Exclui a cópia da biblioteca; o arquivo de origem será preservado.': 'Deletes the library copy; the source file will be preserved.',
  'Excluir: {name}': 'Delete: {name}',
  'A capacidade de impor essas restrições varia conforme a ferramenta. Regras escritas no conteúdo continuam necessárias, especialmente para comandos e ações externas.':
    'Enforcement of these restrictions varies by tool. Written instructions are still needed, especially for commands and external actions.',
  'Ajudar com IA': 'Get AI help',
  'Analisa as definições com IA antes da confirmação de salvamento.': 'Uses AI to analyze the definition before confirming the save.',
  'Analisa esta parte e propõe uma definição usando o objetivo do agente e os itens disponíveis no board.':
    'Analyzes this part and proposes a definition using the agent goal and available board items.',
  'Analisar definição com IA': 'Analyze definition with AI',
  'Antes de salvar, a IA analisa o conteúdo, o modelo, as permissões, as skills e os MCPs escolhidos. Revise as sugestões e escolha se deseja melhorar o conteúdo ou salvar a definição como está.':
    'Before saving, AI analyzes the content, model, permissions, skills and MCPs you selected. Review suggestions and choose whether to improve the content or save the definition as it is.',
  'Aplicar sugestão': 'Apply suggestion',
  'Arquivo ausente; este item não pode ser selecionado.': 'File missing; this item cannot be selected.',
  'As permissões definem quais ferramentas o agente pode usar. Marque só as necessárias e descreva no conteúdo os limites de uso. O board mantém suas próprias ferramentas de fluxo; estas categorias controlam as capacidades adicionais do especialista.':
    'Permissions define which tools the agent can use. Select only what is needed and describe usage limits in the content. The board keeps its own workflow tools; these categories control the specialist’s additional capabilities.',
  'Consulta a ferramenta de IA e atualiza os modelos disponíveis neste board.':
    'Queries the AI tool and updates available models for this board.',
  'Defina quando chamar este especialista, o que ele deve fazer e como deve entregar o resultado. Preencha as partes com suas palavras ou peça ajuda à IA em cada uma. O conteúdo final reúne essas instruções em Markdown.':
    'Define when to call this specialist, what it should do and how to deliver results. Fill in each part in your own words or ask AI for help. The final content combines these instructions in Markdown.',
  'Definição do subagente': 'Subagent definition',
  'Detectar modelos disponíveis': 'Detect available models',
  'Editor de subagente': 'Subagent editor',
  'Criar subagente': 'Create subagent',
  'Editar subagente': 'Edit subagent',
  'Escolha um nome curto para a especialidade, como revisor-de-seguranca.':
    'Choose a short name for the specialty, such as security-reviewer.',
  'Exemplo: revise autenticação e permissões, sem editar arquivos. Entregue achados com arquivo, impacto e evidência; se não houver problemas, diga o que foi verificado.':
    'Example: review authentication and permissions without editing files. Report findings with file, impact and evidence; if there are no issues, state what was checked.',
  'Filtrar MCPs do subagente': 'Filter subagent MCPs',
  'Filtrar skills do subagente': 'Filter subagent skills',
  'Indicada pela IA': 'Recommended by AI',
  'Indicar com IA': 'Get AI recommendations',
  'MCP (Model Context Protocol) é um padrão para conectar a IA a ferramentas e fontes de dados, como documentação, bancos e serviços. Um servidor MCP oferece operações que o agente pode chamar. Use quando a tarefa precisar dessas integrações: o acesso fica explícito e padronizado, mas não é necessário para todo agente.':
    'MCP (Model Context Protocol) is a standard for connecting AI to tools and data sources such as documentation, databases and services. An MCP server provides operations the agent can call. Use it when the task needs these integrations: access becomes explicit and standardized, but not every agent needs it.',
  'Melhorar conteúdo automaticamente': 'Improve content automatically',
  'Nenhum item deste tipo na biblioteca. Crie ou importe um na respectiva aba do Harness.':
    'No items of this type in the library. Create or import one in the corresponding Harness tab.',
  'O modelo executa as instruções deste especialista. Escolha entre os modelos disponíveis para a ferramenta atual ou deixe vazio (—) para usar o modelo do card ou da sessão. Prefira um modelo compatível com a complexidade da tarefa.':
    'The model executes this specialist’s instructions. Choose from models available for the current tool, or leave it empty (—) to use the card or session model. Choose a model suited to the task complexity.',
  'Os MCPs abaixo foram encontrados na biblioteca do board. Escolha apenas os necessários e explique no conteúdo para quê podem ser usados. A seleção permite acesso às ferramentas do servidor; não substitui a definição de limites para ações externas.':
    'The MCPs below were found in the board library. Choose only what is needed and explain their intended use in the content. Selection grants access to server tools; it does not replace limits for external actions.',
  'Partes das instruções': 'Instruction sections',
  Permissões: 'Permissions',
  'Permissões indicadas: {items}': 'Recommended permissions: {items}',
  'Permite criar e alterar arquivos. Marque para agentes que implementam mudanças; deixe desmarcado para revisores que só apontam problemas.':
    'Allows creating and editing files. Select for agents implementing changes; leave unchecked for reviewers who only report problems.',
  'Permite delegar partes da tarefa a outros subagentes, quando a ferramenta suporta isso. Use apenas para agentes que precisam coordenar outros especialistas.':
    'Allows delegating parts of a task to other subagents when supported by the tool. Use only for agents coordinating other specialists.',
  'Permite executar comandos no terminal, como testes e builds. Comandos também podem alterar arquivos; descreva no conteúdo quais são permitidos.':
    'Allows terminal commands such as tests and builds. Commands can also change files; describe allowed commands in the content.',
  'Permite ler arquivos e buscar nomes, trechos e referências no projeto. Indicado para análise e revisão.':
    'Allows reading files and searching names, snippets and references in the project. Useful for analysis and review.',
  'Permite pesquisar e consultar conteúdo na internet. Use quando a tarefa precisar de documentação externa atualizada.':
    'Allows searching and reading internet content. Use when the task needs current external documentation.',
  'Preencha as instruções para revisar o subagente.': 'Fill in instructions to review the subagent.',
  'Preencha nome e conteúdo e aguarde a IA terminar.': 'Enter a name and content, and wait for AI to finish.',
  'Revise o Markdown completo. Explique quando delegar, a responsabilidade, os limites e os critérios de conclusão.':
    'Review the full Markdown. Explain when to delegate, responsibilities, limits and completion criteria.',
  'Salvar como está': 'Save as is',
  'Salvar sem revisão de IA': 'Save without AI review',
  'Selecionar indicadas': 'Select recommended',
  'Sem descrição cadastrada. Revise este artefato na biblioteca antes de selecioná-lo.':
    'No description available. Review this artifact in the library before selecting it.',
  'Skills são procedimentos reutilizáveis: ensinam como executar uma tarefa, com passos, referências e critérios de validação. Escolha as que este especialista precisa conhecer. Elas complementam suas instruções; selecionar todas aumenta o contexto sem necessariamente melhorar o resultado.':
    'Skills are reusable procedures: they teach a task with steps, references and validation criteria. Choose those this specialist needs. They complement its instructions; selecting everything adds context without necessarily improving the result.',
  'Sugestão aplicada ao rascunho. Revise o resultado antes de salvar.': 'Suggestion applied to the draft. Review the result before saving.',
  'Sugestões da IA': 'AI suggestions',
  'Um subagente é um especialista com instruções e ferramentas próprias. Ele recebe uma tarefa delimitada e devolve um resultado ao agente que o chamou. No board, também pode ser escolhido para executar um card ou uma fase; cadastrá-lo não o torna o agente padrão. O suporte à delegação depende da ferramenta de IA.':
    'A subagent is a specialist with its own instructions and tools. It receives a scoped task and returns results to the calling agent. On the board, it can also be selected to run a card or phase; registering it does not make it the default agent. Delegation support depends on the AI tool.',
  'Usar modelo indicado': 'Use recommended model',
  'Usar permissões indicadas': 'Use recommended permissions',
  'Ver conteúdo sugerido': 'View suggested content',
  'Montar conteúdo com as respostas?': 'Build content from the answers?',
  'O conteúdo atual será substituído pelo texto das partes preenchidas.':
    'Current content will be replaced with the text from the completed sections.',
  'Montar conteúdo': 'Build content',
  'Montar conteúdo com respostas': 'Build content from answers',
  'A IA não respondeu no formato esperado. Tente novamente.': 'AI did not respond in the expected format. Try again.',
  'A assistência de IA não está disponível neste board.': 'AI assistance is not available on this board.',
  'Pedido de assistência de subagente inválido.': 'Invalid subagent assistance request.',
  'A definição do subagente é grande demais para analisar.': 'The subagent definition is too large to analyze.',
  'Modelo do card ou da sessão': 'Card or session model',
  'Modelo indicado: {model}': 'Recommended model: {model}',
  'Interromper assistência': 'Stop assistance',
  'Item não encontrado na biblioteca. Desmarque para retirar esta referência do agente.':
    'Item not found in the library. Uncheck it to remove this reference from the agent.',
  'Para que serve este MCP?': 'What is this MCP for?',
  'Exemplo: consulta issues e pull requests do GitHub para acompanhar o desenvolvimento.':
    'Example: queries GitHub issues and pull requests to track development.',
};
