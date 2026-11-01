# Responsividade dos seletores de modelo e esforço no chat

## Contexto

No chat lateral, que é estreito, a barra de controles abaixo do campo de texto tem o seletor de
modelo e o de esforço ao lado do botão Enviar. O seletor de esforço (`Select` do Radix com
`aria-label` "Esforço do modelo", no `ModelEditor` de `FieldRenderer.tsx`) ficava só com a seta: o
gatilho do esforço tinha `flex: 1; min-width: 0`, e a linha `.model-editor` não quebrava. Com isso,
o listbox do popper herdava a largura espremida e não ficava legível.

## Decisão

Regras de CSS só sob `.chat-tools .model-editor`, em `src/webview/styles.css`:

- `.chat-tools .model-editor` quebra a linha (`flex-wrap: wrap`), e o modelo passa a ocupar a
  largura da linha quando ela não cabe;
- o gatilho do esforço (`.rt-SelectTrigger`) ganha largura mínima de 9rem, e não encolhe até a seta.

As Configurações e a classe global `.picker-*` não mudam, então o resto da aplicação fica como estava.

## Alternativas descartadas

- **Medir a largura em JavaScript e trocar o layout.** Mais complexo (um observador de tamanho na
  webview) para um problema que o CSS resolve sem estado nenhum.
- **Separar o `ModelEditor` em duas linhas fixas.** Mexe no componente e no DOM, sem ganho sobre a
  quebra de linha da linha flex. Quebraria a leitura do componente que já funciona nas outras telas.

## Consequências

- Só o chat muda. As regras estão escopadas, então o `.picker-trigger` global continua igual.
- A quebra de linha mantém o valor visível em painel estreito, ao custo de uma linha a mais.
- O layout não foi visto em navegador (o agente de implementação não tem navegador). Fica como
  ressalva para a homologação, nos painéis estreito e largo e nos temas claro e escuro.
- Não há teste de CSS no projeto; a validação foi por leitura do código e pelo `npm run validate`.
