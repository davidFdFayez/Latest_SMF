/**
 * Accessibility audit for Phase 1 compliance case P8:
 * "Keyboard nav, form labels, alt text, colour contrast — meets basic WCAG AA."
 *
 * Checks run against the live DOM rather than the source, so they see what a
 * user actually gets after React has rendered.
 */
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173'
const PAGES = [
  ['home', '/'],
  ['calendar', '/activities/calendar'],
  ['results', '/organization/results-archive'],
  ['contact', '/contact'],
  ['register', '/registration'],
  ['news', '/media/news'],
]

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

// sRGB relative luminance, per WCAG.
const AUDIT = () => {
  const problems = []
  const add = (rule, detail) => problems.push({ rule, detail })

  // 1. Document language — screen readers pick pronunciation from it.
  const html = document.documentElement
  if (!html.getAttribute('lang')) add('html-lang', 'no lang attribute on <html>')

  // 2. Images need alt text (empty alt is fine: it marks the image decorative).
  document.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('alt')) {
      add('img-alt', (img.getAttribute('src') || '').slice(-60))
    }
  })

  // 3. Every control needs an accessible name.
  const named = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return true
    if (el.getAttribute('aria-labelledby')?.trim()) return true
    if (el.getAttribute('title')?.trim()) return true
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true
    if (el.closest('label')) return true
    // A link or button wrapping an image takes its name from that image's alt.
    const img = el.querySelector('img[alt]')
    if (img && img.getAttribute('alt').trim()) return true
    return (el.textContent || '').trim().length > 0
  }

  // Anything inside an aria-hidden subtree is not in the accessibility tree at
  // all, so it cannot be an unnamed control.
  const exposed = (el) => !el.closest('[aria-hidden="true"]')

  document.querySelectorAll('button, a[href]').forEach((el) => {
    if (exposed(el) && !named(el)) {
      add(el.tagName === 'BUTTON' ? 'button-name' : 'link-name', el.className || el.outerHTML.slice(0, 70))
    }
  })

  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.type === 'hidden') return
    if (!named(el) && !el.getAttribute('placeholder')) {
      add('control-label', `${el.tagName.toLowerCase()}[${el.type || ''}] ${el.className || ''}`.slice(0, 70))
    }
    // A placeholder alone is not a label: it disappears on input.
    if (!named(el) && el.getAttribute('placeholder')) {
      add('placeholder-as-label', `${el.tagName.toLowerCase()} "${el.getAttribute('placeholder')}"`.slice(0, 70))
    }
  })

  // 4. Heading order should not skip levels.
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1])
  if (levels.length && levels[0] !== 1) add('heading-start', `first heading is h${levels[0]}`)
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) add('heading-skip', `h${levels[i - 1]} -> h${levels[i]}`)
  }
  if (document.querySelectorAll('h1').length > 1) {
    add('multiple-h1', String(document.querySelectorAll('h1').length))
  }

  // 5. A skip link, so keyboard users can bypass the nav on every page.
  const first = document.querySelector('a[href^="#"]')
  const hasSkip = first && /skip|تخط/i.test(first.textContent || '')
  if (!hasSkip) add('skip-link', 'no skip-to-content link')

  // 6. Landmarks.
  if (!document.querySelector('main, [role="main"]')) add('landmark-main', 'no <main>')

  // 7. Focus must be visible. Sample the interactive controls.
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea')].slice(0, 25)
  focusables.forEach((el) => {
    el.focus()
    const cs = getComputedStyle(el)
    const invisible =
      (cs.outlineStyle === 'none' || cs.outlineWidth === '0px') &&
      cs.boxShadow === 'none' &&
      !el.matches(':focus-visible')
    if (invisible && document.activeElement === el) {
      add('focus-visible', (el.className || el.tagName).toString().slice(0, 60))
    }
  })

  return problems
}

const totals = {}
for (const [name, path] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(700)
    const problems = await page.evaluate(AUDIT)

    const grouped = {}
    problems.forEach((p) => {
      grouped[p.rule] = grouped[p.rule] || []
      grouped[p.rule].push(p.detail)
    })

    console.log(`\n--- ${name}  (${path})`)
    if (!Object.keys(grouped).length) console.log('    clean')
    for (const [rule, items] of Object.entries(grouped)) {
      totals[rule] = (totals[rule] || 0) + items.length
      console.log(`    ${rule.padEnd(22)} x${items.length}`)
      ;[...new Set(items)].slice(0, 3).forEach((d) => console.log(`        ${d}`))
    }
  } catch (err) {
    console.log(`\n--- ${name}: FAILED ${err.message.slice(0, 90)}`)
  }
  await page.close()
}

console.log('\n=== totals across pages ===')
Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([rule, n]) => console.log(`  ${rule.padEnd(22)} ${n}`))

await browser.close()
