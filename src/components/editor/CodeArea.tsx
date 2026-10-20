'use client';
// CodeMirror 6 (ADR 0002): one view; each file keeps its own state (undo history, cursor) while you switch
// between files. Languages load when a file needs them, so the editor page stays small.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { basicSetup, EditorView } from 'codemirror';
import { languageOf, type CodeLanguage } from '@/lib/project/files';

const LOADERS: Record<CodeLanguage, () => Promise<Extension>> = {
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  java: () => import('@codemirror/lang-java').then((m) => m.java()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
};

// Colours come from the design tokens, so light and dark themes both read well (globals.css --code-*).
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: 'var(--code-keyword)',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--code-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)],
    color: 'var(--code-def)',
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--code-type)' },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--code-tag)' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--code-attr)' },
]);
const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'var(--surface)', height: '100%', fontSize: '0.88rem' },
  '.cm-content': { fontFamily: 'var(--f-mono)', caretColor: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--f-mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent-soft) 60%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft)' },
  '&.cm-focused': { outline: 'none' },
});

// The nonce this document's CSP allows: the one its first scripts were served with. After a client-side navigation
// the `nonce` prop comes from a later request, and a <style> with that nonce would be blocked, leaving the editor
// unstyled. Browsers hide the attribute's value but keep the `nonce` property.
export function documentNonce(fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || fallback;
}

export type CodeAreaHandle = { replaceDoc: (text: string) => void };
type Props = {
  path: string;
  doc: string;
  nonce: string;
  readOnly?: boolean;
  resetKey: number;
  onChange: (path: string, text: string) => void;
};

export const CodeArea = forwardRef<CodeAreaHandle, Props>(function CodeArea(
  { path, doc, nonce, readOnly = false, resetKey, onChange },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const open = useRef(path);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const makeState = (p: string, text: string) => {
    const language = new Compartment();
    const state = EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        theme,
        syntaxHighlighting(highlight),
        language.of([]),
        EditorView.cspNonce.of(documentNonce(nonce)), // CodeMirror injects <style>; the nonce keeps the strict CSP happy
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ 'aria-label': `Code for ${p}` }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(p, u.state.doc.toString());
        }),
      ],
    });
    const lang = languageOf(p);
    if (lang)
      void LOADERS[lang]().then((ext) => {
        if (open.current === p) view.current?.dispatch({ effects: language.reconfigure(ext) });
        else {
          const saved = states.current.get(p);
          if (saved) states.current.set(p, saved.update({ effects: language.reconfigure(ext) }).state);
        }
      });
    return state;
  };

  useEffect(() => {
    view.current = new EditorView({ parent: host.current!, state: makeState(path, doc) });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; files switch by swapping states
  }, []);

  // Another file opened: keep this one's state, show that one's.
  useEffect(() => {
    if (!view.current || path === open.current) return;
    states.current.set(open.current, view.current.state);
    open.current = path;
    view.current.setState(states.current.get(path) ?? makeState(path, doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doc is only read for a file opened the first time
  }, [path]);

  // The whole project was replaced (zip upload) or files renamed: start again from the files given.
  useEffect(() => {
    if (!view.current || resetKey === 0) return;
    states.current.clear();
    open.current = path;
    view.current.setState(makeState(path, doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on reset
  }, [resetKey]);

  useImperativeHandle(ref, () => ({
    replaceDoc: (text) => view.current?.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: text } }),
  }));

  return <div className="code-area" ref={host} />;
});
