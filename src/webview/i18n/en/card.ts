export const card: Record<string, string> = {
  // CardDrawer, cabeçalho e abas
  'Criado {created} · Atualizado {updated}': 'Created {created} · Updated {updated}',
  'Este card está na lixeira.': 'This card is in the trash.',
  'Este card está arquivado.': 'This card is archived.',
  'Sub-tarefa de': 'Sub-task of',
  'ID do card': 'Card ID',
  Detalhes: 'Details',
  Conversa: 'Conversation',
  Anexos: 'Attachments',
  Tipo: 'Type',
  Coluna: 'Column',
  Restaurar: 'Restore',
  'Ações do card': 'Card actions',
  Ações: 'Actions',
  Desarquivar: 'Unarchive',
  Arquivar: 'Archive',
  'Mover para a lixeira': 'Move to trash',
  'Fechar (Esc)': 'Close (Esc)',
  Fechar: 'Close',

  // AgentBar
  Agente: 'Agent',
  'O que a sessão de IA usa para trabalhar neste card: skills, servidores MCP, ferramentas e modelo':
    'What the AI session uses to work on this card: skills, MCP servers, tools and model',
  'Da fase ({name})': 'From the phase ({name})',
  'Da fase (nenhum)': 'From the phase (none)',
  'subagente {name}': 'subagent {name}',
  'skills: {list}': 'skills: {list}',
  'MCP: board': 'MCP: board',
  'MCP: board + {list}': 'MCP: board + {list}',
  'modelo {name}': 'model {name}',
  'modelo {name} · {effort}': 'model {name} · {effort}',
  'sessão limpa': 'clean session',

  // WorkspaceBar
  'Branch da história': 'Story branch',
  'Abrir a pasta de trabalho': 'Open the working folder',
  'Cria a branch da história e, no modo worktree, a pasta de trabalho dela':
    'Creates the story branch and, in worktree mode, its working folder',
  'Criar branch da história': 'Create story branch',

  // Anexos
  '"{name}" tem mais de 20 MB e não foi anexado.': '"{name}" is larger than 20 MB and was not attached.',
  'Artefatos da história': 'Story artifacts',
  'Abre o documento anexado à história': 'Opens the document attached to the story',
  'anexado à história': 'attached to the story',
  'Escolher arquivos…': 'Choose files…',
  'ou arraste arquivos para cá (segure Shift ao soltar), ou cole uma imagem. Até 20 MB cada.':
    'or drag files here (hold Shift when dropping), or paste an image. Up to 20 MB each.',
  'Nenhum anexo.': 'No attachments.',
  'Documento de uma fase': 'A phase document',
  artefato: 'artifact',
  'Mostrar na pasta': 'Show in folder',
  'Remover anexo': 'Remove attachment',
  'Remover "{name}"?': 'Remove "{name}"?',
  'O arquivo anexado será apagado.': 'The attached file will be deleted.',
  Remover: 'Remove',

  // Checklist
  Checklist: 'Checklist',
  'Concluir "{text}"': 'Complete "{text}"',
  'Remover o item': 'Remove the item',
  '+ Novo item (Enter)': '+ New item (Enter)',

  // Conversa
  'Nenhuma mensagem ainda. A conversa com a IA sobre este card acontece aqui.':
    'No messages yet. The conversation with the AI about this card happens here.',
  '{tool} está trabalhando neste card… A resposta aparece aqui quando terminar.':
    '{tool} is working on this card… The reply appears here when it finishes.',
  Parar: 'Stop',
  'Escreva uma mensagem… (Cmd+Enter envia; cole imagens direto aqui)': 'Write a message… (Cmd+Enter sends; paste images right here)',
  'Chamar a IA daqui não está disponível para o {tool}.': 'Calling the AI from here is not available for {tool}.',
  'Permissão do {tool} ao ser chamado: {permission}.': '{tool} permission when called: {permission}.',
  Mudar: 'Change',
  Enviar: 'Send',
  'Roda o {tool} em segundo plano para ler a conversa e trabalhar neste card. A resposta chega aqui, sem acompanhamento ao vivo.':
    'Runs {tool} in the background to read the conversation and work on this card. The reply arrives here, with no live tracking.',
  'Enviar e chamar IA': 'Send and call AI',
  'Chamar IA': 'Call AI',
  editado: 'edited',
  'Apagar esta mensagem?': 'Delete this message?',
  'Apagar a mensagem de {author}?': 'Delete the message from {author}?',
  Apagar: 'Delete',
  Editar: 'Edit',
  Cancelar: 'Cancel',
  Salvar: 'Save',
  // permissões do runner (shared/runner.ts)
  'Só o board': 'Board only',
  'Board e arquivos do projeto': 'Board and project files',
  'Sem restrições': 'No restrictions',
  'A IA lê o projeto e usa as ferramentas do board (conversa, anexos, status, mover cards). Não altera arquivos do projeto nem roda comandos.':
    'The AI reads the project and uses the board tools (conversation, attachments, status, moving cards). It does not change project files or run commands.',
  'Além do board, a IA cria e altera arquivos do projeto sem pedir confirmação. Comandos de terminal continuam fora.':
    'Besides the board, the AI creates and changes project files without asking for confirmation. Terminal commands remain off limits.',
  'A IA altera arquivos e roda qualquer comando sem pedir confirmação. Use só em projetos e máquinas em que isso é aceitável.':
    'The AI changes files and runs any command without asking for confirmation. Use only on projects and machines where that is acceptable.',

  // Descrição
  Descrição: 'Description',
  Concluir: 'Done',
  'Descreva o problema, o contexto e o critério de aceite. Markdown suportado.':
    'Describe the problem, the context and the acceptance criteria. Markdown supported.',
  'Clique para adicionar uma descrição…': 'Click to add a description…',

  // Campos
  Campos: 'Fields',
  'Esforço do modelo': 'Model effort',
  'Sugerido pelas regras: {model}': 'Suggested by the rules: {model}',
  Usar: 'Use',

  // Vínculos
  Vínculos: 'Links',
  'é o pai deste card': 'is the parent of this card',
  'é filho deste card': 'is a child of this card',
  'é relativo': 'is related',
  'Remover o vínculo': 'Remove the link',
  'Remover o vínculo com {card}': 'Remove the link with {card}',
  'Este card não está vinculado a nenhum outro.': 'This card is not linked to any other.',
  Pai: 'Parent',
  Filhos: 'Children',
  Relativos: 'Related',
  '{done}/{total} encerrados': '{done}/{total} closed',
  'Tipo de vínculo': 'Link type',
  'Buscar card para vincular': 'Search for a card to link',
  'Buscar card por número ou título…': 'Search card by number or title…',
  'Nenhum card disponível com "{query}".': 'No card available matching "{query}".',
  'Cards encontrados': 'Cards found',

  // Sub-tarefas
  'Sub-tarefas': 'Sub-tasks',
  'Ver no board': 'View on the board',
  Arquivada: 'Archived',
  '+ Nova sub-tarefa (Enter)': '+ New sub-task (Enter)',

  // Campos de card (FieldRenderer)
  'Abrir o link': 'Open the link',
  Modelo: 'Model',
  '{id} (fora do catálogo)': '{id} (not in the catalog)',
  'Este modelo não tem ajuste de esforço.': 'This model has no effort setting.',
  'Escolha um modelo primeiro.': 'Choose a model first.',
  baixo: 'low',
  leve: 'light',
  médio: 'medium',
  alto: 'high',
  'muito alto': 'very high',
  máximo: 'max',
  ultra: 'ultra',

  // Editor de markdown
  'Negrito (Cmd+B)': 'Bold (Cmd+B)',
  'Itálico (Cmd+I)': 'Italic (Cmd+I)',
  Título: 'Heading',
  Lista: 'List',
  'Lista numerada': 'Numbered list',
  'Lista de tarefas': 'Task list',
  Citação: 'Quote',
  Código: 'Code',
  'Link (Cmd+K)': 'Link (Cmd+K)',
  texto: 'text',
  código: 'code',
  Escrever: 'Write',
  Visualizar: 'Preview',
  'Recolher (Esc)': 'Collapse (Esc)',
  'Expandir editor': 'Expand editor',
  Recolher: 'Collapse',
  Expandir: 'Expand',
  'Markdown suportado': 'Markdown supported',
  'Nada para visualizar.': 'Nothing to preview.',

  // Seletor de skills
  'Escolher skills': 'Choose skills',
  'Não encontrada no disco.': 'Not found on disk.',
  'Nenhuma skill.': 'No skills.',
  'Escolher skills ({n})': 'Choose skills ({n})',
  'Skills cujo nome ou descrição combinam com a intenção descrita': 'Skills whose name or description match the stated intent',
  'Sugerir pela intenção ({n})': 'Suggest from intent ({n})',
  'A IA lê o arquivo de cada skill marcada ao executar. Busque pelo nome ou pela descrição.':
    'The AI reads the file of each selected skill when it runs. Search by name or description.',
  'Buscar skill': 'Search skill',
  'Buscar por nome ou descrição…': 'Search by name or description…',
  'Origem das skills': 'Skill source',
  Todas: 'All',
  Marcadas: 'Selected',
  Projeto: 'Project',
  Globais: 'Global',
  Plugins: 'Plugins',
  Sugeridas: 'Suggested',
  'Marcar as {n} sugeridas': 'Select the {n} suggested',
  Skills: 'Skills',
  projeto: 'project',
  global: 'global',
  plugin: 'plugin',
  'Nenhuma skill com "{query}".': 'No skill matching "{query}".',
  'Nenhuma skill nesta aba.': 'No skills in this tab.',
  'Mostrando {shown} de {total}: refine a busca para ver as outras.': 'Showing {shown} of {total}: refine the search to see the rest.',
  '{n} marcadas': '{n} selected',
  Limpar: 'Clear',
};
