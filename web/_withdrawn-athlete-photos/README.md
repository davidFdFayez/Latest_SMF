# Withdrawn athlete photographs

These six files were referenced by the named-athlete cards on the homepage
National Team section and on `/organization/achievements`. QA (CNT-01) found
that none of them shows the athlete the card names:

| File | Card it was used on | Problem |
|---|---|---|
| `athlete-hattan.jpg` | Hattan Alsaif — Women's 54 kg | Not a photograph of the named athlete |
| `athlete-male-1.jpg` | Inad Baowaydhan — Men's Senior | Not a photograph of the named athlete |
| `athlete-male-2.jpg` | Albaraa Alamoudi — Men's 57 kg | Not a photograph of the named athlete |
| `athlete-youth-f.jpg` | Fatimah Kashmiri — Youth | Not a photograph of the named athlete |
| `athlete-para.jpg` | Aljawhara Alhazza — Para, visual impairment | Shows a male fighter under a woman's name |
| `athlete-para-1.jpg` | Ali Alnasser — Para | An event graphic showing **two different athletes**, Tami Al-Amri and Abdulaziz Al-Mubarrad, with their names burned into the image |

They have been moved **out of `web/public/`** so that nothing serves them any
more — not the cards, and not a direct URL either. The cards now render
`/assets/images/athlete-placeholder.svg`, a neutral silhouette.

This repository is not under version control, so the files are kept here rather
than deleted. They are not part of the build: `web/public/` is what Vite copies
into `dist/`, and this directory sits outside it.

**Do not restore them.** Replace the placeholder only with a real, licensed
photograph of the athlete the card names, supplied by the federation. Until
then, the silhouette is the correct thing to show — using someone else's
likeness under another athlete's name is both a credibility problem and a
consent problem.

Point a card at a real photo by setting `photo:` in `FEATURED` / `YOUTH_PARA`
in `web/src/pages/organization/Achievements.jsx` and `img:` in the National Team
block of `web/src/pages/Home.jsx`.
