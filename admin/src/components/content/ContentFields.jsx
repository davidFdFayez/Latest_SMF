import { useState } from 'react'
import MediaPicker from '../MediaPicker'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '../Icons'
import { emptyObject } from './schema'

/*
 * Form controls generated from a content schema (see ContentCatalog on the API).
 *
 * Field types: text / textarea ({ ar, en }), string, url, image, file, select,
 * boolean, group (nested fields), list (repeatable nested fields). Optional
 * schema hints: label, help, rows, options, itemLabel, itemTitle.
 */

function Label({ field }) {
  return <span className="cms-label">{field.label || field.name}</span>
}

function Hint({ field }) {
  return field.help ? <span className="field__hint">{field.help}</span> : null
}

const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
]

function LocalizedField({ field, value, onChange }) {
  const current = value && typeof value === 'object' ? value : { ar: '', en: '' }
  const multiline = field.type === 'textarea'
  const rowsFor = (text) => Math.min(14, Math.max(field.rows || 3, Math.ceil(String(text || '').length / 80)))

  return (
    <div className="cms-field">
      <Label field={field} />
      <div className="cms-bilingual">
        {LANGUAGES.map(({ code, name, dir }) => (
          <label className="cms-lang" key={code}>
            <span className="cms-lang__tag">{name}</span>
            {multiline ? (
              <textarea
                dir={dir}
                rows={rowsFor(current[code])}
                value={current[code] ?? ''}
                onChange={(event) => onChange({ ...current, [code]: event.target.value })}
              />
            ) : (
              <input
                type="text"
                dir={dir}
                value={current[code] ?? ''}
                onChange={(event) => onChange({ ...current, [code]: event.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <Hint field={field} />
    </div>
  )
}

function StringField({ field, value, onChange }) {
  const isLink = field.type === 'url'
  return (
    <label className="cms-field cms-field--narrow">
      <Label field={field} />
      <input
        type="text"
        dir={isLink ? 'ltr' : 'auto'}
        value={value ?? ''}
        placeholder={isLink ? '/page-path, https://…, mailto: or tel:' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <Hint field={field} />
    </label>
  )
}

function SelectField({ field, value, onChange }) {
  return (
    <label className="cms-field cms-field--narrow">
      <Label field={field} />
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {(field.options || []).map((option) => {
          const optionValue = typeof option === 'object' ? option.value : option
          const optionLabel = typeof option === 'object' ? option.label || option.value : option
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          )
        })}
      </select>
      <Hint field={field} />
    </label>
  )
}

function BooleanField({ field, value, onChange }) {
  return (
    <div className="cms-field">
      <label className="field--checkbox cms-checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.label || field.name}</span>
      </label>
      <Hint field={field} />
    </div>
  )
}

function MediaField({ field, value, onChange }) {
  return (
    <div className="cms-field">
      <Label field={field} />
      <MediaPicker value={value} onChange={onChange} kind={field.type === 'image' ? 'image' : 'file'} />
      <Hint field={field} />
    </div>
  )
}

function GroupField({ field, value, onChange }) {
  return (
    <fieldset className="cms-group">
      <legend>{field.label || field.name}</legend>
      <Hint field={field} />
      <FieldList fields={field.fields} value={value} onChange={onChange} />
    </fieldset>
  )
}

const plainText = (value) => (value && typeof value === 'object' ? value.en || value.ar : value)

function itemSummary(field, item, index) {
  const named = field.itemTitle ? plainText(item?.[field.itemTitle]) : ''
  if (named) return named
  for (const child of field.fields || []) {
    if (['text', 'textarea', 'string'].includes(child.type)) {
      const text = plainText(item?.[child.name])
      if (text) return text
    }
  }
  return `${field.itemLabel || 'Item'} ${index + 1}`
}

function ListField({ field, value, onChange }) {
  const items = Array.isArray(value) ? value : []
  const itemLabel = field.itemLabel || 'item'
  // Small items (one or two plain fields) are edited inline, always open.
  const compact =
    (field.fields || []).length <= 2 && field.fields.every((child) => !['group', 'list', 'image', 'textarea'].includes(child.type))
  const [open, setOpen] = useState(() => new Set())

  function setItem(index, next) {
    onChange(items.map((item, i) => (i === index ? next : item)))
  }

  function add() {
    onChange([...items, emptyObject(field.fields)])
    setOpen((current) => new Set(current).add(items.length))
  }

  function remove(index) {
    if (!window.confirm(`Remove this ${itemLabel.toLowerCase()}?`)) return
    onChange(items.filter((_, i) => i !== index))
    setOpen((current) => new Set([...current].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))))
  }

  function move(index, delta) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    setOpen((current) => {
      const moved = new Set()
      current.forEach((i) => moved.add(i === index ? target : i === target ? index : i))
      return moved
    })
  }

  function toggle(index) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="cms-field cms-list">
      <div className="cms-list__head">
        <span className="cms-label">
          {field.label || field.name} <span className="cms-list__count">{items.length}</span>
        </span>
        <button type="button" className="btn btn--secondary btn--small" onClick={add}>
          <PlusIcon /> Add {itemLabel.toLowerCase()}
        </button>
      </div>
      <Hint field={field} />

      {items.length === 0 ? (
        <p className="cms-list__empty">Nothing here yet.</p>
      ) : (
        <ol className="cms-list__items">
          {items.map((item, index) => {
            const expanded = compact || open.has(index)
            return (
              <li key={index} className={`cms-item${expanded ? ' is-open' : ''}${compact ? ' cms-item--compact' : ''}`}>
                <div className="cms-item__head">
                  {compact ? (
                    <span className="cms-item__index">{index + 1}</span>
                  ) : (
                    <button type="button" className="cms-item__toggle" aria-expanded={expanded} onClick={() => toggle(index)}>
                      <span className="cms-item__index">{index + 1}</span>
                      <span className="cms-item__title">{itemSummary(field, item, index)}</span>
                    </button>
                  )}
                  {compact && (
                    <div className="cms-item__inline">
                      <FieldList fields={field.fields} value={item} onChange={(next) => setItem(index, next)} />
                    </div>
                  )}
                  <div className="cms-item__tools">
                    <button type="button" className="icon-btn" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Move down"
                      aria-label="Move down"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                    </button>
                    <button type="button" className="icon-btn icon-btn--danger" title="Remove" aria-label="Remove" onClick={() => remove(index)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {expanded && !compact && (
                  <div className="cms-item__body">
                    <FieldList fields={field.fields} value={item} onChange={(next) => setItem(index, next)} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export function Field({ field, value, onChange }) {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return <LocalizedField field={field} value={value} onChange={onChange} />
    case 'image':
    case 'file':
      return <MediaField field={field} value={value} onChange={onChange} />
    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} />
    case 'boolean':
      return <BooleanField field={field} value={value} onChange={onChange} />
    case 'group':
      return <GroupField field={field} value={value} onChange={onChange} />
    case 'list':
      return <ListField field={field} value={value} onChange={onChange} />
    default:
      return <StringField field={field} value={value} onChange={onChange} />
  }
}

export function FieldList({ fields = [], value, onChange }) {
  const current = value && typeof value === 'object' ? value : {}
  return (
    <div className="cms-fields">
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={current[field.name]}
          onChange={(next) => onChange({ ...current, [field.name]: next })}
        />
      ))}
    </div>
  )
}
