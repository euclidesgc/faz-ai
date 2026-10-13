import './setup';
import { describe, expect, it } from 'vitest';
import type { Attachment } from '../../src/shared/model';
import { resolveAttachmentRefs } from '../../src/webview/components/card/attachmentRefs';

const anexo = (cardId: string, filename: string, storedName: string): Attachment => ({
  id: `a-${cardId}-${filename}`,
  cardId,
  filename,
  storedName,
  mime: 'image/png',
  size: 10,
  createdAt: 1,
  artifact: false,
});

describe('resolveAttachmentRefs', () => {
  const lista = [anexo('c1', 'tela.png', 'x1.png'), anexo('c2', 'tela.png', 'x2.png'), anexo('c1', 'meu arquivo (1).png', 'y1 (1).png')];

  it('troca a referência pelo endereço do anexo do mesmo card', () => {
    expect(resolveAttachmentRefs('veja ![tela](attachment:tela.png)', 'c1', lista, 'https://anexos')).toBe(
      'veja ![tela](https://anexos/c1/x1.png)',
    );
    expect(resolveAttachmentRefs('![tela](attachment:tela.png)', 'c2', lista, 'https://anexos')).toBe('![tela](https://anexos/c2/x2.png)');
  });

  it('troca também o link de um arquivo que não é imagem', () => {
    expect(resolveAttachmentRefs('[doc](attachment:tela.png)', 'c1', lista, 'https://anexos')).toBe('[doc](https://anexos/c1/x1.png)');
  });

  it('deixa como está sem o anexo, sem a base de endereços ou de outro card', () => {
    const texto = '![x](attachment:nao-existe.png)';
    expect(resolveAttachmentRefs(texto, 'c1', lista, 'https://anexos')).toBe(texto);
    expect(resolveAttachmentRefs('![tela](attachment:tela.png)', 'c1', lista, '')).toBe('![tela](attachment:tela.png)');
    expect(resolveAttachmentRefs('![tela](attachment:tela.png)', 'c3', lista, 'https://anexos')).toBe('![tela](attachment:tela.png)');
  });

  it('codifica o nome guardado em disco', () => {
    expect(resolveAttachmentRefs('![a](attachment:meu)', 'c1', [anexo('c1', 'meu', 'y 1 (1).png')], 'https://anexos')).toBe(
      '![a](https://anexos/c1/y%201%20(1).png)',
    );
  });
});
