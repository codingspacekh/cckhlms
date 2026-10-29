'use client';
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Icon } from '@/components/ui/Icon';
import { CODE_LANGUAGES, codeLanguage } from '@/lib/code-highlight';
import { Select } from '@/components/ui/Select';

// A code block in the editor: dark blue like the reading view, with its language and a remove button on top.
export function CodeBlockView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const lang = String(node.attrs.language ?? '');
  const known = codeLanguage(lang);
  return (
    <NodeViewWrapper className="code-block">
      <div className="code-head" contentEditable={false}>
        <label className="code-lang">
          Language
          <Select value={known?.id ?? lang} onChange={(e) => updateAttributes({ language: e.target.value || null })}>
            {CODE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
            {lang && !known && <option value={lang}>{lang}</option>}
            <option value="">Plain text</option>
          </Select>
        </label>
        <button type="button" className="code-remove" aria-label="Remove code block" title="Remove code block" onClick={deleteNode}>
          <Icon name="trash" />
        </button>
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
