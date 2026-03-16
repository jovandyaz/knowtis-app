import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

import { lowlight } from './lowlight-instance';

import './CodeBlockView.css';

const LANGUAGES = lowlight.listLanguages().sort();

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const currentLanguage = (node.attrs.language as string) ?? '';

  return (
    <NodeViewWrapper as="pre" className="code-block-wrapper">
      <select
        contentEditable={false}
        className="code-block-language-select"
        value={currentLanguage}
        onChange={(e) => updateAttributes({ language: e.target.value || null })}
      >
        <option value="">auto</option>
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
      <NodeViewContent<'code'> as="code" />
    </NodeViewWrapper>
  );
}
