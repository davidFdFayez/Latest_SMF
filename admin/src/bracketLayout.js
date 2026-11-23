/**
 * The single-direction bracket, laid out from the stored bouts.
 *
 * Pure: no React, no DOM, so it can be tested on its own. Every position and
 * every connector comes from the stored advancement graph — each bout's
 * winnerToBoutId and winnerToCorner — never from array order or proximity.
 *
 * Storage (DrawService, unchanged): round 1 holds one row per first-round
 * slot. A row with one athlete and IsBye (not a walkover) is a BYE: the
 * athlete is already seated in the bout it feeds. It is drawn as a matchup
 * card of the same size as a bout — the athlete's row, then a grey BYE row —
 * but it is not a bout: it is not numbered or counted, and its connector
 * leaves from the athlete's row. Everything else is an actual bout.
 *
 * The bracket shows no bout numbers (those belong to the Bout Schedule): a
 * card is its round and its two corners, and a corner still waiting for a
 * winner reads "Winner of <round>". The numbering of actual bouts, 1… in
 * round order, is still worked out and kept on each node for reference.
 *
 * Columns run left to right, one per round, then the Champion endpoint. The
 * first column's entries (BYE holders and opening bouts) are stacked in tree
 * order; every later bout sits level with the midpoint of its two feeders,
 * so each connector is a straight run out, one vertical, and a straight run
 * into the corner it fills.
 */

export const GEOMETRY = {
  CARD_W: 268,
  // No header row: bout numbers are not shown in the bracket.
  HEAD_H: 0,
  ROW_H: 40,
  COL_GAP: 58,
  GAP_SIBLING: 14,
  GAP_BLOCK: 30,
  HEADINGS_H: 62,
  PAD_X: 8,
  PAD_BOTTOM: 12,
  CHAMPION_W: 214,
  MEDAL: 62,
}

const G = GEOMETRY
const CARD_H = G.HEAD_H + G.ROW_H * 2
// Where a card's connectors meet it: the line between its two corners.
const CARD_ANCHOR = G.HEAD_H + G.ROW_H
// A BYE card is a matchup card (same size); its line leaves from the athlete's row.
const BYE_ANCHOR = G.HEAD_H + G.ROW_H / 2

export const cardHeight = CARD_H

/** Centre of the row a corner occupies, relative to the card's top. */
export function cornerY(corner) {
  return G.HEAD_H + (corner === 'red' ? G.ROW_H / 2 : G.ROW_H * 1.5)
}

const isByeEntry = (b) => b.round === 1 && b.isBye && !b.isWalkover

export function buildLayout(bracket) {
  const T = bracket?.totalRounds || 0
  const rounds = bracket?.rounds || []
  const issues = []
  const all = rounds.flatMap((r) => r.bouts.map((b) => ({ ...b, round: r.round })))
  if (T === 0 || all.length === 0) return { empty: true, issues, nodes: [], lines: [], headings: [] }

  const byId = new Map(all.map((b) => [b.id, b]))
  const roundName = Object.fromEntries(rounds.map((r) => [r.round, r.nameEn]))

  // Actual bouts, numbered in round order; BYE entries are not bouts.
  const actual = all.filter((b) => !isByeEntry(b)).sort((a, b) => a.round - b.round || a.position - b.position)
  const number = new Map(actual.map((b, i) => [b.id, i + 1]))

  // The graph: who feeds each corner of each bout.
  const feeders = new Map()
  for (const b of all) {
    if (!b.winnerToBoutId) {
      if (b.round !== T) issues.push(`Bout row ${b.id} (round ${b.round}) has no destination.`)
      continue
    }
    const target = byId.get(b.winnerToBoutId)
    if (!target) {
      issues.push(`Bout row ${b.id} points to ${b.winnerToBoutId}, which is not in this draw.`)
      continue
    }
    if (target.round !== b.round + 1) issues.push(`Bout row ${b.id} skips from round ${b.round} to ${target.round}.`)
    const slot = feeders.get(target.id) || {}
    if (slot[b.winnerToCorner]) issues.push(`Two sources feed the ${b.winnerToCorner} corner of bout row ${target.id}.`)
    slot[b.winnerToCorner] = b
    feeders.set(target.id, slot)
  }
  const finals = all.filter((b) => b.round === T)
  if (finals.length !== 1) issues.push(`The last round has ${finals.length} bouts, not one.`)
  const final = finals[0]

  const athleteOf = (b) => b.red || b.blue
  const slotOf = (bout, corner) => {
    const entry = bout[corner]
    const from = feeders.get(bout.id)?.[corner]
    // The BYE card before it already says BYE: no second badge on the athlete here.
    if (from && isByeEntry(from)) return { kind: 'athlete', entry: entry || athleteOf(from), tag: null }
    if (entry) return { kind: 'athlete', entry, tag: from?.isWalkover ? 'WO' : null }
    if (from) return { kind: 'winner', of: number.get(from.id), ofRound: roundName[from.round] }
    if (bout.isWalkover) return { kind: 'withdrawn' }
    return { kind: 'empty' }
  }

  /* ── vertical placement, in tree order from the Final ─────────────────── */
  const top = new Map()
  const anchor = new Map()
  let cursor = G.HEADINGS_H
  let lastLeafParent
  let first = true
  const seen = new Set()
  // The lowest edge used so far in each column, to keep cards apart.
  const columnBottom = new Map()
  const subtree = (id) => [
    id,
    ...['red', 'blue'].flatMap((c) => (feeders.get(id)?.[c] ? subtree(feeders.get(id)[c].id) : [])),
  ]

  const place = (bout, parentId) => {
    if (seen.has(bout.id)) {
      issues.push(`Bout row ${bout.id} is reached twice.`)
      return
    }
    seen.add(bout.id)
    const kids = feeders.get(bout.id) || {}
    const children = ['red', 'blue'].map((c) => kids[c]).filter(Boolean)
    if (children.length === 0) {
      if (bout.round !== 1) issues.push(`Bout row ${bout.id} (round ${bout.round}) has no sources.`)
      const bye = isByeEntry(bout)
      const sibling = parentId === lastLeafParent
      const gap = first ? 0 : !sibling ? G.GAP_BLOCK : G.GAP_SIBLING
      const y = cursor + gap
      top.set(bout.id, y)
      anchor.set(bout.id, y + (bye ? BYE_ANCHOR : CARD_ANCHOR))
      cursor = y + CARD_H
      columnBottom.set(bout.round, y + CARD_H)
      lastLeafParent = parentId
      first = false
      return
    }
    if (children.length === 1) issues.push(`Bout row ${bout.id} has only one source.`)
    for (const child of children) place(child, bout.id)
    const mid = children.reduce((s, c) => s + anchor.get(c.id), 0) / children.length
    anchor.set(bout.id, mid)
    top.set(bout.id, mid - CARD_ANCHOR)
    // A bout centred on its sources could touch the card above it in its
    // column: if so, move its whole branch down. Alignment within the branch
    // is unchanged.
    const above = columnBottom.get(bout.round)
    const shift = above === undefined ? 0 : above + G.GAP_SIBLING - top.get(bout.id)
    if (shift > 0) {
      for (const id of subtree(bout.id)) {
        top.set(id, top.get(id) + shift)
        anchor.set(id, anchor.get(id) + shift)
        const node = byId.get(id)
        if (columnBottom.get(node.round) !== undefined) {
          columnBottom.set(node.round, Math.max(columnBottom.get(node.round), top.get(id) + CARD_H))
        }
      }
      cursor += shift
    }
    columnBottom.set(bout.round, top.get(bout.id) + CARD_H)
  }
  if (final) place(final, null)
  for (const b of all) if (!seen.has(b.id)) issues.push(`Bout row ${b.id} is not connected to the Final.`)

  // A bout centred on two BYE cards' athlete rows sits a little higher than
  // they do: move the whole tree down until its highest card clears the heading row.
  const lift = G.HEADINGS_H - Math.min(...top.values())
  if (lift > 0) {
    for (const [id, y] of top) top.set(id, y + lift)
    for (const [id, y] of anchor) anchor.set(id, y + lift)
  }

  const colX = (round) => G.PAD_X + (round - 1) * (G.CARD_W + G.COL_GAP)
  const championX = colX(T + 1)
  const width = championX + G.CHAMPION_W + G.PAD_X

  const nodes = all
    .filter((b) => seen.has(b.id))
    .map((b) => {
      const bye = isByeEntry(b)
      const node = {
        id: b.id,
        bout: b,
        round: b.round,
        roundName: roundName[b.round],
        kind: bye ? 'bye' : 'bout',
        x: colX(b.round),
        y: top.get(b.id),
        w: G.CARD_W,
        h: CARD_H,
        anchorY: anchor.get(b.id),
      }
      if (bye) {
        node.entry = athleteOf(b)
        node.corner = b.winnerToCorner || 'red'
      } else {
        node.number = number.get(b.id)
        node.red = slotOf(b, 'red')
        node.blue = slotOf(b, 'blue')
      }
      return node
    })
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  /* ── connectors: out, one vertical, into the corner it fills ──────────── */
  const lines = []
  for (const n of nodes) {
    const to = n.bout.winnerToBoutId
    if (!to) continue
    const target = nodeById.get(to)
    if (!target) continue
    const fromX = n.x + n.w
    const fromY = n.anchorY
    const toX = target.x
    const toY = target.y + cornerY(n.bout.winnerToCorner)
    const midX = fromX + G.COL_GAP / 2
    lines.push({
      key: `${n.id}-${to}`,
      from: n.id,
      to,
      corner: n.bout.winnerToCorner,
      points: { fromX, fromY, midX, toY, toX },
      d: `M${fromX} ${fromY} H${midX} V${toY} H${toX}`,
    })
  }

  const bottom = Math.max(...nodes.map((n) => n.y + n.h))
  const finalNode = final && nodeById.get(final.id)
  const champion = finalNode && {
    x: championX,
    y: finalNode.anchorY,
    line: {
      key: 'champion',
      from: finalNode.id,
      to: 'champion',
      d: `M${finalNode.x + finalNode.w} ${finalNode.anchorY} H${championX + 10}`,
    },
  }
  if (champion) {
    lines.push(champion.line)
  }

  const headings = []
  for (let r = 1; r <= T; r++) headings.push({ key: `r${r}`, x: colX(r), w: G.CARD_W + 20, name: roundName[r] })
  headings.push({ key: 'champion', x: championX, w: G.CHAMPION_W, name: 'Champion' })

  const summary = rounds.map((r) => ({
    name: r.nameEn,
    bouts: r.bouts.filter((b) => !isByeEntry({ ...b, round: r.round })).length,
  }))
  const byeHolders = all.filter(isByeEntry).map(athleteOf)

  return {
    empty: false,
    width,
    height: Math.max(bottom, champion ? champion.y + G.MEDAL / 2 : 0) + G.PAD_BOTTOM,
    nodes,
    lines,
    headings,
    champion,
    issues,
    summary,
    byeHolders,
  }
}
