/** Blank values for a content schema field, used when adding a list item. */
export function emptyFor(field) {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return { ar: '', en: '' }
    case 'boolean':
      return false
    case 'group':
      return emptyObject(field.fields)
    case 'list':
      return []
    default:
      return ''
  }
}

export function emptyObject(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.name, emptyFor(field)]))
}
