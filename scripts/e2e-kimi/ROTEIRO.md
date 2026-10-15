# Roteiro do e2e com o Kimi Code

Valida a integração do Faz AI com a CLI `kimi` numa máquina limpa. Precisa de Docker sem `sudo` e de
uma conta Kimi Code. Marque cada passo e anote o resultado; ao fim, copie o que anotou para
`docs/decisoes/0540-e2e-real-com-a-cli-kimi.md`.

Versão da CLI (`kimi --version`): ______ URL do instalador que funcionou: ______

## 1. Subir o board

- [ ] `npm run e2e:kimi`. Esperado: o endereço do board (`http://localhost:7878/?t=…`) abre no
      navegador do computador, com o projeto `meu-app`.
- [ ] `docker exec -it faz-ai-e2e-kimi bash` abre um terminal no contêiner (usuário `dev`).
- [ ] `command -v kimi git gh` não imprime nada: a máquina está limpa.

## 2. Instalar a CLI e fazer login

- [ ] Instalar: `curl -fsSL "${KIMI_INSTALL_URL:-https://code.kimi.com/kimi-code/install.sh}" | bash`.
      A documentação traz mais de um endereço; se esse falhar, tente
      `https://code.kimi.com/install.sh` ou `npm install -g @moonshot-ai/kimi-code`. Anote o que
      funcionou e o que o instalador pediu a mais (Node, uv, unzip…).
- [ ] `kimi --version` imprime a versão (anote acima).
- [ ] `kimi login`: imprime uma URL de autorização (device code), que abre sozinha no navegador do
      computador. Esperado: termina com código de saída 0 e cria `~/.kimi-code/credentials/`.
- [ ] Sem navegador, só para quem tem chave: `KIMI_MODEL_NAME` e `KIMI_MODEL_API_KEY` criam um modelo
      temporário em memória. **Não** exercita o login nem a pasta `credentials/`: use só se o login
      acima não puder ser feito.

## 3. O que o board enxerga

- [ ] Configurações → Harness de IA: escolher **Kimi Code**.
- [ ] Diagnóstico do ambiente: o item da `kimi` aparece como instalado e o login como feito
      (`~/.kimi-code/credentials/`). Git, gh e uv aparecem como ausentes.
- [ ] `kimi provider list --json` lista os modelos; o catálogo do board mostra os mesmos.
- [ ] **Conectar IA** grava o servidor do board em `.kimi-code/mcp.json` (projeto) ou
      `~/.kimi-code/mcp.json` (global); dentro de `kimi`, o comando `/mcp` o lista.

## 4. Uma execução pelo board

- [ ] Criar um card simples ("responda OK e mova este card para Concluído") e rodar a IA pelo board.
      Esperado: o board dispara `kimi -p --output-format stream-json`, o andamento aparece no card e
      o card termina.
- [ ] As ferramentas `mcp__faz-ai__*` respondem (o card muda de coluna ou ganha um comentário).
- [ ] O stream-json traz custo/tokens? Anote: ______ (o Discovery da #531 assumiu que a 2.1.1 não
      traz).

## 5. O que a #531 deixou como "não validado"

- [ ] Hooks e agentes de fábrica da #531 existem em `~/.kimi-code/` (`config.toml` e `agents/`).
- [ ] Lista de ferramentas do agente Kimi (`tools`, com o glob `mcp__*`): o agente enxerga as
      ferramentas do board. Se não, anote o formato que funciona.
- [ ] `subagents: "*"`: o agente consegue delegar a subagentes? Anote o resultado.
- [ ] Formato `[[hooks]]` no `config.toml` da 2.1.1: o hook roda (um efeito visível, como o log)?

## 6. Encerrar

- [ ] Preencher a tabela "Resultado do roteiro" em `docs/decisoes/0540-e2e-real-com-a-cli-kimi.md`.
- [ ] `docker rm -f faz-ai-e2e-kimi` apaga só o contêiner e mantém a imagem (a próxima subida é
      rápida). `npm run e2e:kimi -- remover` apaga contêiner e imagem.
