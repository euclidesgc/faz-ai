import { lastSent, renderThemed, seedBoard, sentOf } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '../../src/shared/model';
import type { HostToWebview } from '../../src/shared/messages';
import { AttachmentModal } from '../../src/webview/components/attachment/AttachmentModal';
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

describe('AttachmentModal', () => {
  it('não aparece sem anexo aberto na store', () => {
    renderThemed(<AttachmentModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('anexo de texto abre em visualização, com o conteúdo já pedido ao host', async () => {
    renderThemed(<AttachmentModal />);
    open(attachment({}));
    expect(await screen.findByRole('dialog', { name: 'notas.md' })).toBeInTheDocument();
    const read = lastSent('attachment.read');
    expect(read.attachmentId).toBe('att-1');
    reply({ type: 'attachment.readResult', requestId: read.requestId, content: '# título' });
    expect(await screen.findByText('# título')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar conteúdo' })).toBeEnabled();
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
