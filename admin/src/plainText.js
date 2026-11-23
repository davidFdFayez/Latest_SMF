/**
 * Plain-text descriptions ↔ the editor's HTML.
 *
 * Descriptions are stored as plain text: paragraphs separated by a blank
 * line, lines within a paragraph, "- " bulleted and "1. " numbered lists —
 * the same text the website reads and shows (its tournament page and the
 * Activities cards). The editor works in HTML, so the text is turned into
 * that shape on the way in and back into the same plain text on the way
 * out. Nothing richer is ever stored, so every place that shows a
 * description keeps working unchanged.
 */

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const BULLET = /^[-•*]\s+/
const NUMBER = /^\d+[.)]\s+/

/** Stored text → editor HTML, block by block as the website reads it. */
export function textToHtml(text) {
  const source = String(text || '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (!source) return ''
  return source
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) return ''
      if (lines.every((line) => BULLET.test(line))) {
        return `<ul>${lines.map((line) => `<li><p>${escape(line.replace(BULLET, ''))}</p></li>`).join('')}</ul>`
      }
      if (lines.every((line) => NUMBER.test(line))) {
        return `<ol>${lines.map((line) => `<li><p>${escape(line.replace(NUMBER, ''))}</p></li>`).join('')}</ol>`
      }
      return `<p>${lines.map(escape).join('<br>')}</p>`
    })
    .join('')
}

/** The text of an element, with line breaks kept and nested lists left out. */
function inlineText(element) {
  let text = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent
    else if (node.nodeName === 'BR') text += '\n'
    else if (node.nodeName === 'UL' || node.nodeName === 'OL') continue
    else if (node.nodeType === Node.ELEMENT_NODE) text += inlineText(node)
  }
  return text
}

/** A list's items as lines; nested items become further lines of the same list. */
function listLines(list, ordered, counter = { n: 0 }) {
  const lines = []
  for (const item of list.children) {
    if (item.nodeName !== 'LI') continue
    const text = inlineText(item)
      .replace(/\s*\n\s*/g, ' ')
      .trim()
    if (text) {
      counter.n += 1
      lines.push(ordered ? `${counter.n}. ${text}` : `- ${text}`)
    }
    for (const nested of item.children) {
      if (nested.nodeName === 'UL' || nested.nodeName === 'OL') lines.push(...listLines(nested, ordered, counter))
    }
  }
  return lines
}

/** Editor HTML → the stored plain text. */
export function htmlToText(html) {
  if (!html) return ''
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
  const blocks = []
  for (const node of body.childNodes) {
    let block = ''
    if (node.nodeName === 'UL' || node.nodeName === 'OL') block = listLines(node, node.nodeName === 'OL').join('\n')
    else if (node.nodeType === Node.ELEMENT_NODE) {
      block = inlineText(node)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
    } else if (node.nodeType === Node.TEXT_NODE) block = node.textContent.trim()
    if (block) blocks.push(block)
  }
  return blocks.join('\n\n')
}
