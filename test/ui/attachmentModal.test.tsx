import { lastSent, renderThemed, seedBoard, sentOf } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '../../src/shared/model';
import type { HostToWebview } from '../../src/shared/messages';
import { AttachmentModal, isMarkdown, renderSafeMarkdown } from '../../src/webview/components/attachment/AttachmentModal';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeAll(async () => {
  await seedBoard();
});

const attachment = (over: Partial<Attachment>): Attachment => ({
  id: 'att-1',
  cardId: 'card-1',
  filename: 'notas.md',
  storedName: 'att-1-notas.md',
  mime: 'text/markdown',
  size: 12,
  createdAt: 0,
  artifact: false,
  ...over,
});

/** Põe o anexo no board e abre a modal nele, como o clique da lista fará. */
function open(a: Attachment): void {
  act(() => {
    const state = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...state, attachments: [a] }, attachmentsBaseUri: 'https://board/attachments' });
    useBoardStore.getState().openAttachmentModal(a.id);
  });
}

/** O host respondendo ao pedido da modal (o canal real é um `message` na janela). */
function reply(msg: HostToWebview): void {
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

describe('isMarkdown', () => {
  it('reconhece pelo mime text/markdown', () => {
    expect(isMarkdown(attachment({ filename: 'doc.txt', mime: 'text/markdown' }))).toBe(true);
  });

  it('reconhece pela extensão .md ou .markdown, mesmo com mime genérico', () => {
    expect(isMarkdown(attachment({ filename: 'DOC.MD', mime: 'text/plain' }))).toBe(true);
    expect(isMarkdown(attachment({ filename: 'doc.markdown', mime: 'text/plain' }))).toBe(true);
  });

  it('não reconhece .txt nem .json', () => {
    expect(isMarkdown(attachment({ filename: 'doc.txt', mime: 'text/plain' }))).toBe(false);
    expect(isMarkdown(attachment({ filename: 'doc.json', mime: 'application/json' }))).toBe(false);
  });
});

describe('renderSafeMarkdown', () => {
  it('renderiza títulos e tabelas em HTML', () => {
    const html = renderSafeMarkdown('# título\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<h1>título</h1>');
    expect(html).toContain('<table>');
  });

  it('remove script e handlers de evento de um Markdown malicioso', () => {
    const html = renderSafeMarkdown('texto <script>alert(1)</script> e <img src="x" onerror="alert(2)">');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
  });
});

describe('AttachmentModal', () => {
  it('não aparece sem anexo aberto na store', () => {
    renderThemed(<AttachmentModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('anexo de texto puro abre em visualização com o código cru, com o conteúdo já pedido ao host', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({ filename: 'notas.txt', mime: 'text/plain' }));
    expect(await screen.findByRole('dialog', { name: 'notas.txt' })).toBeInTheDocument();
    const read = lastSent('attachment.read');
    expect(read.attachmentId).toBe('att-1');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: '# não é Markdown aqui' });
    expect(await screen.findByText('# não é Markdown aqui')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar conteúdo' })).toBeEnabled();
  });

  it('anexo Markdown abre formatado por padrão, sem os símbolos do Markdown à mostra', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    expect(await screen.findByRole('dialog', { name: 'notas.md' })).toBeInTheDocument();
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: '# título' });
    expect(await screen.findByRole('heading', { name: 'título' })).toBeInTheDocument();
    expect(screen.queryByText('# título')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Modo de visualização' })).toBeInTheDocument();
  });

  it('alternar para Código mostra o Markdown cru, e Formatado volta ao HTML', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: '# título' });
    await screen.findByRole('heading', { name: 'título' });
    await userEvent.click(screen.getByRole('radio', { name: 'Código' }));
    expect(await screen.findByText('# título')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'título' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Formatado' }));
    expect(await screen.findByRole('heading', { name: 'título' })).toBeInTheDocument();
  });

  it('editar e salvar um Markdown atualiza a visualização formatada já escolhida', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: '# antes' });
    await screen.findByRole('heading', { name: 'antes' });
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }), '# depois');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const write = lastSent('attachment.write');
    reply({ type: 'attachment.writeResult', requestId: write.requestId, ok: true });
    expect(await screen.findByRole('heading', { name: 'depois' })).toBeInTheDocument();
  });

  it('um Markdown com script ou onerror não executa nada ao ser renderizado', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({
      type: 'attachment.readResult',
      requestId: read.requestId,
      content: '# título\n\n<script>window.__xss = true</script> <img src="x" onerror="window.__xss = true">',
    });
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('heading', { name: 'título' });
    expect(dialog.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it('o botão Editar troca para o textarea e Cancelar descarta a edição', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: 'antes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const box = screen.getByRole('textbox', { name: 'Conteúdo do anexo' });
    expect(box).toHaveValue('antes');
    await userEvent.type(box, ' e depois');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('antes')).toBeInTheDocument();
    expect(sentOf('attachment.write')).toEqual([]);
  });

  it('Salvar manda o texto editado e, com ok, volta para a visualização', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: 'antes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }), 'depois');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const write = lastSent('attachment.write');
    expect(write.content).toBe('depois');
    reply({ type: 'attachment.writeResult', requestId: write.requestId, ok: true });
    expect(await screen.findByText('depois')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('se o host recusa a escrita, mostra o erro e mantém o texto digitado', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: 'antes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const write = lastSent('attachment.write');
    reply({ type: 'attachment.writeResult', requestId: write.requestId, ok: false, error: 'Anexo não encontrado' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Anexo não encontrado');
    expect(screen.getByRole('textbox', { name: 'Conteúdo do anexo' })).toHaveValue('antes!');
  });

  it('erro na leitura aparece no lugar do conteúdo, sem travar as ações', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, error: 'Anexo maior que 20 MB' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Anexo maior que 20 MB');
    expect(screen.getByRole('button', { name: 'Mostrar na pasta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Salvar como…' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('imagem é mostrada, sem pedir conteúdo nem oferecer edição', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({ filename: 'tela.png', storedName: 'att-1-tela.png', mime: 'image/png' }));
    const img = await screen.findByRole('img', { name: 'tela.png' });
    expect(img).toHaveAttribute('src', 'https://board/attachments/card-1/att-1-tela.png');
    expect(sentOf('attachment.read')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar conteúdo' })).toBeDisabled();
  });

  it('binário sem pré-visualização não tem edição nem cópia', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({ filename: 'manual.pdf', storedName: 'att-1-manual.pdf', mime: 'application/pdf' }));
    expect(await screen.findByText('Pré-visualização não disponível.')).toBeInTheDocument();
    expect(sentOf('attachment.read')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar conteúdo' })).toBeDisabled();
  });

  it('com texto editado e não salvo, Esc não descarta: avisa e só fecha em Descartar', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: 'antes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }), '!');
    await userEvent.keyboard('{Escape}');
    expect(useBoardStore.getState().attachmentModal).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('não foi salvo');
    expect(screen.getByRole('textbox', { name: 'Conteúdo do anexo' })).toHaveValue('antes!');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(useBoardStore.getState().attachmentModal).toBeNull();
  });

  it('Salvar não envia duas vezes enquanto espera a resposta', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    const read = lastSent('attachment.read');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: 'antes' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo do anexo' }), '!');
    const before = sentOf('attachment.write').length;
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(sentOf('attachment.write')).toHaveLength(before + 1);
  });

  it('Escape fecha a modal', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(useBoardStore.getState().attachmentModal).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('anexo removido do board: a modal só avisa e deixa fechar', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    await screen.findByRole('dialog');
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({ state: { ...state, attachments: [] } });
    });
    expect(await screen.findByText('Anexo não encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar na pasta' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeEnabled();
  });
});
