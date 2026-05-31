import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';

import type { ImageAttributes } from './ImageNode';

function readAttrs(node: ProseMirrorNode): ImageAttributes {
  const src = node.attrs['src'];
  const alt = node.attrs['alt'];
  const width = node.attrs['width'];
  const height = node.attrs['height'];
  return {
    src: typeof src === 'string' ? src : '',
    alt: typeof alt === 'string' ? alt : '',
    width: typeof width === 'number' ? width : null,
    height: typeof height === 'number' ? height : null,
  };
}

export function ImageView({
  node,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const { t } = useTranslation('notes');
  const { src, alt, width, height } = readAttrs(node);
  const [editingAlt, setEditingAlt] = useState(false);

  return (
    <NodeViewWrapper className="group relative my-4" data-selected={selected}>
      <div className="relative inline-block max-w-full">
        {src ? (
          <img
            src={src}
            alt={alt}
            width={width ?? undefined}
            height={height ?? undefined}
            className="h-auto max-w-full rounded-(--radius) border border-(--border)"
            contentEditable={false}
            draggable={false}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-(--radius) border border-(--border) bg-(--muted) p-4 text-(--muted-foreground)">
            <ImageOff className="h-4 w-4" /> {t('ai.image.unavailable')}
          </div>
        )}

        {selected && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-(--radius) border border-(--border) bg-(--popover)/90 p-1 shadow-sm backdrop-blur">
            <button
              type="button"
              className="rounded p-1 hover:bg-(--accent)"
              aria-label={t('ai.image.editAlt')}
              onClick={() => setEditingAlt((v) => !v)}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-(--destructive) hover:bg-(--accent)"
              aria-label={t('ai.image.delete')}
              onClick={() => deleteNode()}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editingAlt && (
        <input
          className="mt-1 w-full rounded-(--radius) border border-(--border) bg-transparent px-2 py-1 text-sm"
          placeholder={t('ai.image.altPlaceholder')}
          defaultValue={alt}
          contentEditable={false}
          onBlur={(e) => {
            updateAttributes({ alt: e.target.value });
            setEditingAlt(false);
          }}
        />
      )}

      <NodeViewContent<'figcaption'>
        as="figcaption"
        className="mt-1 text-center text-sm text-(--muted-foreground) empty:before:content-[attr(data-placeholder)]"
        data-placeholder={t('ai.image.captionPlaceholder')}
      />
    </NodeViewWrapper>
  );
}
