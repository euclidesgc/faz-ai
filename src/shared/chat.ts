// Chat do board: conversa com a IA do projeto para criar cards e agir no board.

export interface ChatMessage {
  id: string;
  /** `error` é um aviso do board (a IA falhou, foi interrompida…), não uma resposta dela */
  role: 'user' | 'assistant' | 'error';
  text: string;
  at: number;
  /** modelo e esforço escolhidos quando a pessoa enviou (valor do campo Modelo); só nas mensagens dela */
  model?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** a IA está respondendo agora */
  busy: boolean;
}

export const EMPTY_CHAT: ChatState = { messages: [], busy: false };

/** Quantas mensagens o chat guarda; as mais antigas saem. */
export const MAX_CHAT_MESSAGES = 100;
