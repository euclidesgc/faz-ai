import type { BoardState } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { attachments } from '../../commands';
import { t } from '../../i18n';
import { MAX_ATTACHMENT_BYTES, toBase64 } from './AttachmentsTab';

/** Referência a um anexo do card dentro de um texto: `attachment:<nome do arquivo>`. */
export const ATTACHMENT_SCHEME = 'attachment:';
const ATTACHMENT_LINK = /\]\(attachment:([^)\s]+)\)/g;

/**
 * Troca `](attachment:<nome>)` pelo endereço do anexo de mesmo nome, para a imagem aparecer na tela.
 * Sem o anexo (ou sem a base de endereços), deixa a referência como está.
 */
export function resolveAttachmentRefs(body: string, cardId: string, attachmentList: BoardState['attachments'], baseUri: string): string {
  return body.replace(ATTACHMENT_LINK, (whole, name: string) => {
    const a = attachmentList.find((x) => x.cardId === cardId && x.filename === name);
    return a && baseUri ? `](${baseUri}/${a.cardId}/${encodeURIComponent(a.storedName)})` : whole;
  });
}

export interface AttachmentRefs {
  /** Envia os arquivos colados como anexos do card e devolve o markdown a inserir no cursor. */
  pasteFiles(files: File[]): string;
  /** Aplica `resolveAttachmentRefs` com os anexos e a base de endereços da store. */
  resolve(body: string): string;
}

/**
 * O que a conversa e a descrição do card têm em comum para imagens coladas: o arquivo vira anexo do
 * card, entra no texto como referência a ele e é resolvido para o endereço real na hora de renderizar.
 */
export function useAttachmentRefs(cardId: string): AttachmentRefs {
  const attachmentList = useBoardStore((s) => s.state)!.attachments;
  const baseUri = useBoardStore((s) => s.attachmentsBaseUri);
  const setError = useBoardStore((s) => s.setError);

  const pasteFiles = (files: File[]): string =>
    files
      .map((file, i) => {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(t('"{name}" tem mais de 20 MB e não foi anexado.', { name: file.name }));
          return '';
        }
        const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const filename = `colado-${Date.now()}${i ? `-${i}` : ''}.${ext}`;
        void toBase64(file).then((base64) => attachments.addData({ cardId, filename, base64 }));
        return file.type.startsWith('image/')
          ? `![${filename}](${ATTACHMENT_SCHEME}${filename})`
          : `[${filename}](${ATTACHMENT_SCHEME}${filename})`;
      })
      .filter(Boolean)
      .join('\n');

  const resolve = (body: string): string => resolveAttachmentRefs(body, cardId, attachmentList, baseUri);

  return { pasteFiles, resolve };
}
