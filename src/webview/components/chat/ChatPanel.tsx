import { useEffect, useRef, useState } from 'react';
import { aiToolInfo } from '../../../shared/harness';
import { useBoardStore } from '../../store/boardStore';
import { chat } from '../../commands';
import { ModelEditor } from '../FieldRenderer';
import { renderMarkdown } from '../MarkdownEditor';
import { Button, TextArea } from '@radix-ui/themes';
import { IconSend, IconStop } from '../ui';

/** Pedidos de exemplo: mostram o que o chat sabe fazer e preenchem o campo, sem enviar. */
const EXAMPLES = [
  'Resuma o que está parado no board e o que espera por mim.',
  'Crie uma história "Login com Google" e três sub-tarefas para ela.',
  'Quais cards estão na fase de Spec?',
];

/**
 * Chat com a IA do projeto: a pessoa escreve, a IA responde usando as ferramentas do board (criar e mover
 * cards, vincular, consultar). Modelo e esforço são escolhidos aqui e valem para as próximas mensagens.
 */
export function ChatPanel() {
  const state = useBoardStore((s) => s.state)!;
  const model = useBoardStore((s) => s.chatModel);
  const setModel = useBoardStore((s) => s.setChatModel);
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const { messages, busy } = state.chat;
  const tool = aiToolInfo(state.board.aiTool);

  // acompanha a conversa: a mensagem nova fica à vista
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [messages.length, busy]);

  const send = () => {
    const body = text.trim();
    if (!body || busy) return;
    chat.send(body, model);
    setText('');
  };

  return (
    <section className="chat" aria-label="Chat com a IA">
      <header className="chat-head">
        <h3>Chat com {tool.label}</h3>
        <Button variant="ghost" size="1" disabled={messages.length === 0 && !busy} onClick={chat.clear}>
          Limpar
        </Button>
      </header>
      <div className="chat-log" ref={log} role="log" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p className="muted small">
              Peça à IA para criar, mover e vincular cards ou para resumir o board. Ela age pelas ferramentas do board; escolha o modelo
              abaixo.
            </p>
            {EXAMPLES.map((e) => (
              <Button key={e} variant="soft" color="gray" size="1" onClick={() => setText(e)}>
                {e}
              </Button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' ? (
              <div className="markdown plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
            ) : (
              <p>{m.text}</p>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant typing" role="status">
            <span className="spinner" /> {tool.label} está respondendo…
          </div>
        )}
      </div>
      <div className="chat-composer">
        <TextArea
          aria-label="Mensagem para a IA"
          placeholder="Escreva para a IA… (Enter envia, Shift+Enter quebra a linha)"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="chat-tools">
          <ModelEditor value={model} onChange={(v) => setModel(typeof v === 'string' ? v : null)} />
          {busy ? (
            <Button color="red" variant="soft" onClick={chat.stop}>
              <IconStop /> Parar
            </Button>
          ) : (
            <Button disabled={!text.trim()} onClick={send}>
              <IconSend /> Enviar
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
