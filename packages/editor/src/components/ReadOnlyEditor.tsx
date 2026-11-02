import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { EditorContent, useEditor } from '@tiptap/react';

import { createBaseExtensions } from '../extensions/base-extensions';

interface ReadOnlyEditorProps {
  content: string;
}

export function ReadOnlyEditor({ content }: ReadOnlyEditorProps) {
  const { t } = useTranslation('notes');
  const extensions = useMemo(() => createBaseExtensions(), []);
  const editorProps = useMemo(
    () => ({
      attributes: {
        role: 'textbox',
        'aria-readonly': 'true',
        'aria-label': t('editor.contentLabel'),
      },
    }),
    [t]
  );
  const lastContentRef = useRef(content);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    editorProps,
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== lastContentRef.current) {
      lastContentRef.current = content;
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  return <EditorContent editor={editor} />;
}
