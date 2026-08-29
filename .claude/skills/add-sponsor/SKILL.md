---
name: add-sponsor
description: Add, move or remove a sponsor logo in the README and on the install page. Use when a GitHub sponsor reaches the Team or Company tier, when a sponsorship lapses, or when a sponsor sends a new logo asset.
---

# Adding a sponsor

Assets live in `docs/sponsors/<name>.svg`. Three edits, all by hand — there is no CI.

## README — one block under the install badge, holding both tiers

Company first, Team after, the same `height="28"` for every logo, and **no taglines** (they
force a vertical layout and push the project's own pitch off the screen). The label links to
the Support section so the policy is one click away:

```markdown
<p align="center">
  <sub><b><a href="#support-this-project">Supported by</a></b></sub><br>
  <a href="https://acme.example" rel="sponsored noopener"><img src="docs/sponsors/acme.svg" alt="Acme" height="28"></a>
  &nbsp;
  <a href="https://globex.example" rel="sponsored noopener"><img src="docs/sponsors/globex.svg" alt="Globex" height="28"></a>
</p>
```

Do **not** add a "still MIT / still private" line beside the logos. Both claims are already in
the README's first sentence, above the badge.

## Install page — Company tier only

A row in the footer of `docs/index.html`. The footer is also where the update notice sends
returning users (`d.onclick = window.open(P)` in the shim), which is what the tier sells.

```html
<span class="sponsors"><span class="lbl">Supported by</span>
  <a href="https://acme.example" target="_blank" rel="sponsored noopener"><img src="sponsors/acme.svg" alt="Acme" height="28"></a>
</span>
```
```css
footer .sponsors { display: flex; align-items: center; gap: .5rem .9rem; flex-wrap: wrap; }
footer .sponsors .lbl { font-size: .8rem; color: var(--muted); }
footer .sponsors img { height: 28px; width: auto; max-width: 110px; opacity: .85; }
footer .sponsors a:hover img { opacity: 1; }
```

## Accepting the asset — sanitise before committing

Committing the logo is the right call: it keeps the install page's promise that it makes no
third-party requests. Hot-linking a sponsor's own domain would let them log every visitor's IP.
(refined-github does the same; larger projects instead serve from their funding platform. Nobody
loads a sponsor's server.)

But an SVG is executable XML, so treat every incoming file as untrusted. Rendered through
`<img>` the browser disables scripts and external fetches — however **the file stays reachable
at its own URL on `agarwalvishal.github.io`, and opening it directly executes it in that
origin.** A malicious SVG committed here is stored XSS on the Pages site.

Before committing, open the file and strip:

- `<script>` elements and any `on*` attributes (`onload`, `onclick`, …)
- `<foreignObject>`, and any `javascript:` URI
- external references — `<image href="https://…">`, `<use href>`, `@import` in a `<style>`.
  These also silently re-introduce the third-party request the same-origin rule exists to
  prevent.

An SVG that needs any of the above is not a logo. Ask for a plain one, or a PNG.

Keep the pull request or email that supplied the asset — that is the record of permission to
use the mark, and the sponsor's brand guidelines usually ride along with it. Scale it, never
recolour or crop it.

## Rules

- **Team gets the README block; Company gets first position in it plus the install-page
  footer.** Placement follows the amount, at the thresholds published on the Sponsors profile.
- **Cap: one row, four logos.** A fifth becomes "and N others" linking to the README rather
  than shrinking the row or wrapping to a second line.
- **Order: tier first, then sponsorship start date** — deterministic, so no sponsor is
  hand-picked and any of them can predict where they land.
- `height="28"` inline *and* in CSS, so the row does not reflow while the SVG loads.
- **Remove ~30 days after a sponsorship lapses** — a logo implies a current relationship.
- Logos stay visually subordinate to the not-affiliated-with-Anthropic disclaimer, and a logo
  may be declined if it would imply Anthropic endorsement.

## Verify

1. `git diff main -- claude-chat-exporter.js` is empty — funding work never touches the script.
2. `grep -oE 'https?://[a-zA-Z0-9.-]+' docs/index.html` lists no new host: assets are committed
   and served same-origin, never hot-linked.
3. Every sponsor link carries `rel="sponsored noopener"`.
4. Render the install page locally and check the footer row at 360px, light and dark.
