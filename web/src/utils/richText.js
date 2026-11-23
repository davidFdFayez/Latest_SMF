/**
 * The browser's own check of formatted text from the API (a tournament's
 * Terms & Conditions) before it is put on the page. The server already
 * cleans it when it is saved; this rebuilds it once more from a fixed list
 * of elements, so nothing else can reach the page even if stored text was
 * ever written another way.
 *
 * Kept: p, br, h2–h4, strong, em, u, ol, ul, li — with only text-align and
 * dir on blocks. Other elements keep their text; script-like ones are dropped
 * whole.
 */
const INLINE = new Set(['strong', 'em', 'u', 'br']);
const BLOCKS = new Set(['p', 'h2', 'h3', 'h4', 'ol', 'ul', 'li']);
const RENAME = { b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p' };
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'svg', 'math', 'head', 'title']);
const ALIGN = /text-align\s*:\s*(left|right|center|justify|start|end)\b/i;

export function sanitizeRichText(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  // Parsed in an inert document: nothing in it loads or runs.
  const source = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const target = document.implementation.createHTMLDocument('');
  const out = target.createElement('div');

  const copy = (from, to) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        to.appendChild(target.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const raw = node.tagName.toLowerCase();
      if (DROPPED.has(raw)) continue;
      const tag = RENAME[raw] || raw;
      if (!INLINE.has(tag) && !BLOCKS.has(tag)) {
        copy(node, to); // unknown element: keep its text, lose the element
        continue;
      }
      const element = target.createElement(tag);
      if (BLOCKS.has(tag)) {
        const align = ALIGN.exec(node.getAttribute('style') || '');
        if (align) element.style.textAlign = align[1].toLowerCase();
        const dir = (node.getAttribute('dir') || '').toLowerCase();
        if (['rtl', 'ltr', 'auto'].includes(dir)) element.setAttribute('dir', dir);
      }
      if (tag !== 'br') copy(node, element);
      to.appendChild(element);
    }
  };
  copy(source, out);
  return out.innerHTML;
}

/** True when the text, tags aside, has something to read. */
export function hasRichText(html) {
  return Boolean(html && html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
}
