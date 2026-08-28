/**
 * Colour-contrast and structure audit for Phase 1 case P8.
 * Contrast is computed the way WCAG 2.1 defines it rather than eyeballed.
 */
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})

const CONTRAST = () => {
  const lum = (rgb) => {
    const c = rgb.map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const parse = (str) => {
    const m = str.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 }
  }
  // Returns the resolved background and whether an image/gradient was hit on
  // the way up. Text over a gradient or photo cannot be judged from computed
  // styles alone, so those are reported separately rather than counted as
  // failures against a background that was never actually white.
  const bgOf = (el) => {
    let node = el
    let painted = false
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') painted = true
      const p = parse(cs.backgroundColor)
      if (p && p.a > 0.9) return { rgb: p.rgb, painted }
      node = node.parentElement
    }
    return { rgb: [255, 255, 255], painted }
  }

  const fails = []
  const seen = new Set()
  for (const el of document.querySelectorAll('p,span,a,button,li,h1,h2,h3,h4,h5,h6,td,th,label')) {
    const text = (el.textContent || '').trim()
    if (!text || el.children.length > 0) continue

    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.5) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue

    const fg = parse(cs.color)
    if (!fg) continue

    const l1 = lum(fg.rgb) + 0.05
    const bg = bgOf(el)
    const l2 = lum(bg.rgb) + 0.05
    const ratio = l1 > l2 ? l1 / l2 : l2 / l1

    const size = parseFloat(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 700
    const required = size >= 24 || (size >= 18.66 && bold) ? 3.0 : 4.5

    if (ratio < required) {
      const key = `${cs.color}|${cs.fontSize}|${el.className}`
      if (seen.has(key)) continue
      seen.add(key)
      fails.push({
        painted: bg.painted,
        ratio: Math.round(ratio * 100) / 100,
        required,
        color: cs.color,
        size: cs.fontSize,
        cls: (el.className || el.tagName).toString().slice(0, 46),
        text: text.slice(0, 30),
      })
    }
  }
  return fails
}

const PAGES = [
  ['home', '/'],
  ['calendar', '/activities/calendar'],
  ['results', '/organization/results-archive'],
  ['contact', '/contact'],
  ['register', '/registration'],
]

for (const [name, path] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://localhost:5173' + path, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(700)

  const counts = await page.evaluate(() => ({
    imgs: document.querySelectorAll('img').length,
    imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
    links: document.querySelectorAll('a[href]').length,
    controls: document.querySelectorAll('input,select,textarea').length,
    hasMain: !!document.querySelector('main,[role=main]'),
    lang: document.documentElement.getAttribute('lang'),
    dir: document.documentElement.getAttribute('dir'),
    skip: document.querySelector('a[href^="#"]')?.textContent?.trim()?.slice(0, 28) || null,
  }))
  const fails = await page.evaluate(CONTRAST)

  console.log(`\n--- ${name}`)
  console.log(`    imgs=${counts.imgs} (no alt ${counts.imgsNoAlt}) links=${counts.links} controls=${counts.controls}`)
  console.log(`    lang=${counts.lang} dir=${counts.dir} main=${counts.hasMain} skip=${JSON.stringify(counts.skip)}`)
  const solid = fails.filter((f) => !f.painted)
  const overArt = fails.filter((f) => f.painted)
  console.log(`    contrast failures on a solid background: ${solid.length}   (over image/gradient, unverifiable: ${overArt.length})`)
  solid.forEach((f) =>
    console.log(`       REAL  ${f.ratio} < ${f.required}  ${f.color} @${f.size}  .${f.cls}  "${f.text}"`),
  )
  overArt.slice(0, 4).forEach((f) =>
    console.log(`       skip  ${f.color} @${f.size}  .${f.cls}  "${f.text}"`),
  )
  await page.close()
}

await browser.close()
