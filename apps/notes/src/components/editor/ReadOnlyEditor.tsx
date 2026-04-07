import { useEffect, useMemo, useRef } from 'react';

import { EditorContent, useEditor } from '@tiptap/react';

import { createBaseExtensions } from './extensions/base-extensions';

interface ReadOnlyEditorProps {
  content: string;
}

export function ReadOnlyEditor({ content }: ReadOnlyEditorProps) {
  const extensions = useMemo(
    () => createBaseExtensions({ openLinksOnClick: true }),
    []
  );
  const lastContentRef = useRef(content);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== lastContentRef.current) {
      lastContentRef.current = content;
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  return <EditorContent editor={editor} />;
}
