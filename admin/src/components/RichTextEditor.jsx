import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'

/**
 * A compact rich text editor (TipTap) for formatted text such as a
 * tournament's Terms & Conditions: headings, paragraphs, bold, italic,
 * underline, numbered and bulleted lists, alignment, undo and redo — and
 * nothing else, so what is written is exactly what the server keeps (it
 * cleans the HTML again before storing it).
 *
 * `value` is HTML ('' when empty); `onChange` receives the same. Loaded on
 * demand by the pages that use it, so the rest of the admin stays light.
 *
 * `mode="plain"` is the same editor for text stored as plain text (a
 * tournament description): only paragraphs, line breaks and lists, which
 * plain text can hold — no headings, bold, italic, underline or alignment,
 * which would be lost on saving. Pasted formatting is dropped the same way.
 */
export default function RichTextEditor({ value, onChange, dir = 'ltr', label, disabled = false, mode = 'rich' }) {
  const plain = mode === 'plain'
  // What this editor last reported, so a parent echoing it back is not
  // mistaken for new content (which would reset the cursor and history).
  const lastEmitted = useRef(value || '')

  const editor = useEditor({
    extensions: plain
      ? [
          StarterKit.configure({
            heading: false,
            bold: false,
            italic: false,
            underline: false,
            code: false,
            codeBlock: false,
            strike: false,
            blockquote: false,
            horizontalRule: false,
            link: false,
          }),
        ]
      : [
          StarterKit.configure({
            heading: { levels: [2, 3, 4] },
            code: false,
            codeBlock: false,
            strike: false,
            blockquote: false,
            horizontalRule: false,
            link: false,
          }),
          TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
        ],
    content: value || '',
    editable: !disabled,
    editorProps: {
      attributes: { class: 'rte__content', dir, 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' },
    },
    // Only a real change to the text is reported: TipTap also signals an
    // update when the editor merely becomes editable, and reporting that
    // would rewrite text nobody touched.
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction?.docChanged) return
      const html = current.isEmpty ? '' : current.getHTML()
      lastEmitted.current = html
      onChange(html)
    },
  })

  // Content loaded or replaced from outside (e.g. the tournament arriving).
  useEffect(() => {
    if (!editor || (value || '') === lastEmitted.current) return
    lastEmitted.current = value || ''
    editor.commands.setContent(value || '', { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    // false: switching to editable is not an edit, so no update is sent.
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled, false)
  }, [editor, disabled])

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            block: e.isActive('heading', { level: 2 })
              ? 'h2'
              : e.isActive('heading', { level: 3 })
                ? 'h3'
                : e.isActive('heading', { level: 4 })
                  ? 'h4'
                  : 'p',
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            ordered: e.isActive('orderedList'),
            bullets: e.isActive('bulletList'),
            align: ['left', 'center', 'right', 'justify'].find((a) => e.isActive({ textAlign: a })) || null,
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  })

  if (!editor || !state) return <div className="rte rte--loading" aria-busy="true" />

  const chain = () => editor.chain().focus()
  const setBlock = (block) => {
    if (block === 'p') chain().setParagraph().run()
    else
      chain()
        .setHeading({ level: Number(block.slice(1)) })
        .run()
  }

  const tool = (key, title, active, run, icon, enabled = true) => (
    <button
      key={key}
      type="button"
      className={`rte__btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || !enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  )

  return (
    <div className={`rte${disabled ? ' is-disabled' : ''}`}>
      <div className="rte__toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {!plain && (
          <>
            <select
              className="rte__block"
              value={state.block}
              disabled={disabled}
              aria-label="Text style"
              onChange={(e) => setBlock(e.target.value)}
            >
              <option value="p">Paragraph</option>
              <option value="h2">Heading 1</option>
              <option value="h3">Heading 2</option>
              <option value="h4">Heading 3</option>
            </select>
            <span className="rte__sep" />
            {tool('bold', 'Bold', state.bold, () => chain().toggleBold().run(), <b>B</b>)}
            {tool('italic', 'Italic', state.italic, () => chain().toggleItalic().run(), <i>I</i>)}
            {tool('underline', 'Underline', state.underline, () => chain().toggleUnderline().run(), <u>U</u>)}
            <span className="rte__sep" />
          </>
        )}
        {tool('ol', 'Numbered list', state.ordered, () => chain().toggleOrderedList().run(), <OrderedIcon />)}
        {tool('ul', 'Bulleted list', state.bullets, () => chain().toggleBulletList().run(), <BulletIcon />)}
        <span className="rte__sep" />
        {!plain &&
          ['left', 'center', 'right', 'justify'].map((a) =>
            tool(
              `align-${a}`,
              `Align ${a}`,
              state.align === a,
              // Choosing the active alignment again goes back to the text's natural one.
              () => (state.align === a ? chain().unsetTextAlign().run() : chain().setTextAlign(a).run()),
              <AlignIcon kind={a} />,
            ),
          )}
        {!plain && <span className="rte__sep" />}
        {tool('undo', 'Undo', false, () => chain().undo().run(), <UndoIcon />, state.canUndo)}
        {tool('redo', 'Redo', false, () => chain().redo().run(), <UndoIcon redo />, state.canRedo)}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

const svg = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  'aria-hidden': true,
}

function OrderedIcon() {
  return (
    <svg {...svg}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5h1.5v4M4 9h3M4 15.5c.5-.8 2.5-.8 2.5.5 0 1-2.5 1.5-2.5 3h2.5" strokeWidth="1.6" />
    </svg>
  )
}

function BulletIcon() {
  return (
    <svg {...svg}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function AlignIcon({ kind }) {
  const lines = {
    left: ['M4 6h16', 'M4 10h10', 'M4 14h16', 'M4 18h10'],
    center: ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
    right: ['M4 6h16', 'M10 10h10', 'M4 14h16', 'M10 18h10'],
    justify: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h16'],
  }[kind]
  return (
    <svg {...svg}>
      {lines.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

function UndoIcon({ redo = false }) {
  return (
    <svg {...svg} style={redo ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}
