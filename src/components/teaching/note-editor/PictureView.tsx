'use client';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';

const SIZES = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['full', 'Full'],
] as const;

// A picture in the editor (BR-22): its size (Small/Medium/Full, kept after # in its address, as renderNote reads
// it) and its caption, which is also its text for screen readers.
export function PictureView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const captionId = useId();
  const src = String(node.attrs.src ?? '');
  const [path = '', size = ''] = src.split('#');
  const alt = String(node.attrs.alt ?? '');
  return (
    <NodeViewWrapper as="span" className={`pic-edit${size ? ` pic-${size}` : ''}${selected ? ' is-selected' : ''}`}>
      <img src={path} alt={alt} draggable={false} data-drag-handle />
      <span className="pic-tools" contentEditable={false}>
        <span role="group" aria-label="Picture size" className="pic-sizes">
          {SIZES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={size === value} onClick={() => updateAttributes({ src: `${path}#${value}` })}>
              {label}
            </button>
          ))}
        </span>
        <button type="button" className="pic-remove" aria-label="Remove picture" title="Remove picture" onClick={deleteNode}>
          <Icon name="trash" />
        </button>
      </span>
      <span className="pic-caption" contentEditable={false}>
        <label htmlFor={captionId}>Caption, and what the picture shows for screen readers</label>
        <input id={captionId} type="text" value={alt} maxLength={200} onChange={(e) => updateAttributes({ alt: e.target.value })} />
      </span>
    </NodeViewWrapper>
  );
}
