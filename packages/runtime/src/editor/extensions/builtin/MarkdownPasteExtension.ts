/**
 * Intercepts PASTE_COMMAND, detects markdown-looking plain text via
 * `isLikelyMarkdown`, and inserts a parsed editor-state instead of letting
 * the default handler treat it as plain text. HTML-bearing paste payloads
 * usually fall through to the default handler; the only exception is HTML
 * with inline `data:image/...` sources, which is rewritten through the
 * asset upload pipeline before import.
 *
 * Headless extension (Phase 7.3). Replaces the prior React-component
 * `MarkdownPastePlugin` mounted in Editor.tsx.
 */

import {
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  type LexicalEditor,
  $insertNodes,
  $parseSerializedNode,
  defineExtension,
} from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import type { Transformer } from '@lexical/markdown';

import type { UploadedEditorAsset } from '../../EditorConfig';
import { markdownToJSONSync } from '../../markdown';
import { INSERT_IMAGE_COMMAND, type InsertImagePayload } from '../../plugins/ImagesPlugin';
import { isLikelyMarkdown } from '../../utils/markdownDetection';
import { dataUrlToImageFile, uploadEditorImageAsset } from './imageAssetUpload';

export interface MarkdownPasteConfig {
  transformers: Transformer[];
  minConfidenceScore: number;
  uploadAsset?: (file: File) => Promise<UploadedEditorAsset>;
}

interface RewrittenHtmlPasteResult {
  html: string | null;
  imagePayloads: InsertImagePayload[];
}

async function rewriteClipboardHtmlImages(
  htmlData: string,
  uploadAsset?: (file: File) => Promise<UploadedEditorAsset>,
): Promise<RewrittenHtmlPasteResult | null> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlData, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  const dataImages = images.filter((img) => {
    const src = img.getAttribute('src')?.trim() ?? '';
    return src.startsWith('data:image/');
  });

  if (dataImages.length === 0) {
    return null;
  }

  const imagePayloads = await Promise.all(dataImages.map(async (img, index) => {
    const src = img.getAttribute('src')?.trim();
    if (!src) {
      throw new Error('Clipboard image is missing a src attribute');
    }

    const file = await dataUrlToImageFile(src, `pasted-html-image-${index + 1}`);
    const uploadedSrc = await uploadEditorImageAsset(file, uploadAsset, {
      allowDataUrlFallback: false,
    });
    img.setAttribute('src', uploadedSrc);
    return {
      altText: img.getAttribute('alt') || file.name,
      src: uploadedSrc,
    };
  }));

  const imagesOnly = (doc.body.textContent || '').trim().length === 0;
  return {
    html: imagesOnly ? null : doc.body.innerHTML,
    imagePayloads,
  };
}

function insertHtmlIntoEditor(editor: LexicalEditor, html: string): void {
  editor.update(() => {
    const parser = new DOMParser();
    const dom = parser.parseFromString(html, 'text/html');
    const nodes = $generateNodesFromDOM(editor, dom);
    $insertNodes(nodes);
  });
}

export const MarkdownPasteExtension = defineExtension({
  name: '@nimbalyst/editor/markdown-paste',
  config: { transformers: [] as Transformer[], minConfidenceScore: 15, uploadAsset: undefined } as MarkdownPasteConfig,
  register: (editor, config) => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        // HTML payload available. Only intercept when the HTML contains
        // inline clipboard images so they can be rewritten to asset paths.
        const htmlData = clipboardData.getData('text/html');
        if (htmlData && htmlData.trim().length > 0) {
          if (!/src\s*=\s*["']data:image\//i.test(htmlData)) {
            return false;
          }

          event.preventDefault();
          (async () => {
            try {
              const rewrittenPaste = await rewriteClipboardHtmlImages(htmlData, config.uploadAsset);
              if (!rewrittenPaste) {
                return;
              }

              if (rewrittenPaste.html === null) {
                for (const payload of rewrittenPaste.imagePayloads) {
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, payload);
                }
                return;
              }

              insertHtmlIntoEditor(editor, rewrittenPaste.html);
            } catch (error) {
              console.error('[MarkdownPasteExtension] Failed to rewrite HTML image paste:', error);
            }
          })();
          return true;
        }

        const plainText = clipboardData.getData('text/plain');
        if (!plainText || plainText.trim().length === 0) {
          return false;
        }

        // Shift+paste = "paste as plain text"; skip transformation.
        if ((event as ClipboardEvent & { shiftKey?: boolean }).shiftKey) {
          return false;
        }

        const isMarkdown = isLikelyMarkdown(plainText, {
          minConfidenceScore: config.minConfidenceScore,
        });
        if (!isMarkdown) {
          return false;
        }

        event.preventDefault();

        try {
          editor.update(() => {
            const importedEditorStateJSON = markdownToJSONSync(
              editor,
              config.transformers,
              plainText,
            );
            const nodes = importedEditorStateJSON.root.children.map($parseSerializedNode);
            $insertNodes(nodes);
          });
          return true;
        } catch (error) {
          console.error('[MarkdownPasteExtension] Failed to transform markdown:', error);
          return false;
        }
      },
      COMMAND_PRIORITY_HIGH,
    );
  },
});
