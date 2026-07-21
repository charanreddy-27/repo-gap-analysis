# Deployment

The showcase site in [`site/`](site/) is static — no build step, no framework, no environment
variables. It deploys to Vercel in about two minutes.

The CLI itself isn't deployed; it runs locally. See [README](README.md#run-it-locally).

---

## What ships

```
site/
  index.html            landing page
  about.html            about me
  about-project.html    the build story
  styles.css            design system (both themes)
  theme.js              theme toggle
  favicon.svg
  og.svg                social card source — see step 6
vercel.json             at repo root: routes Vercel at site/
```

`vercel.json` sets `outputDirectory: "site"` and stubs out install/build, so Vercel serves the
static files directly and never runs `tsc`. Site deploys are decoupled from the CLI build.

---

## Deploy to Vercel

### 1. Push the repo to GitHub

```bash
git remote add origin https://github.com/charanreddy-27/repo-gap-analysis.git
git push -u origin main
```

### 2. Import the project

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
2. Pick `repo-gap-analysis`
3. Leave every field at its default — `vercel.json` supplies the settings

### 3. Confirm the detected settings

Vercel should show these from `vercel.json`. If any field is editable and wrong, correct it:

| Setting | Value |
|---|---|
| Framework Preset | Other |
| Root Directory | `./` (repo root — **not** `site`; `vercel.json` handles it) |
| Build Command | `echo "static site — no build step"` |
| Output Directory | `site` |
| Install Command | `echo "static site — no install needed"` |
| Environment Variables | none |

### 4. Deploy

Click **Deploy**. First build takes ~30 seconds. You'll get a
`repo-gap-analysis-<hash>.vercel.app` URL.

### 5. Custom domain (optional)

To serve it at `repogap.charanreddy.dev`:

1. Vercel → Project → **Settings** → **Domains** → add `repogap.charanreddy.dev`
2. At your DNS provider for `charanreddy.dev`, add the record Vercel shows:

   | Type | Name | Value |
   |---|---|---|
   | `CNAME` | `repogap` | `cname.vercel-dns.com` |

3. Wait for propagation (usually minutes). Vercel issues the TLS certificate automatically.

**If you use a different domain**, update the `og:url`, `twitter:` and `canonical` tags in all
three HTML files — they currently hardcode `https://repogap.charanreddy.dev`. Absolute URLs are
required for social cards; relative paths won't render on LinkedIn or X.

### 6. Generate `og.png`

Social platforms want a raster image. `site/og.svg` is the source at the correct 1200×630.

Export it once and commit the result as `site/og.png`:

- **Figma / Illustrator** — import the SVG, export at 1× PNG
- **CLI** — `npx svgexport site/og.svg site/og.png 1200:630`
- **Browser** — open the SVG, screenshot at exactly 1200×630

The meta tags already point at `/og.png`. Until it exists, social previews fall back to a plain
link card.

---

## Verify after deploying

- [ ] All three pages load, and the nav links between them work
- [ ] Theme toggle switches, and the choice survives a refresh
- [ ] Paste the URL into the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
      and confirm the OG card renders
- [ ] Lighthouse ≥ 95 on Performance and Accessibility (no JS framework, so this should be easy)
- [ ] Check it on a phone — the terminal blocks scroll horizontally inside their own container,
      the page body should never scroll sideways

---

## Manual steps only you can do

1. **Create the GitHub repo** at `github.com/charanreddy-27/repo-gap-analysis` and push.
2. **Import to Vercel** and deploy (steps 2–4).
3. **Add the DNS CNAME** for `repogap.charanreddy.dev` at your registrar (step 5).
4. **Export `og.png`** from `og.svg` and commit it (step 6).
5. **Record a terminal GIF** of a real `repogap analyze` run, save as `site/demo.gif`, and swap
   it into the README where the screenshot placeholder is.
6. **Fill in the LinkedIn post URL** — `site/about-project.html` has a `TODO` comment on the
   placeholder link; replace it once the post is live.
7. **Post on LinkedIn.** The angle that'll land: *the agent that says skip* — ten of sixteen
   findings were Skips, and the read-only rule is a permission callback, not a prompt. Link the
   site, not the repo.
8. **Add the project to [charanreddy.dev](https://www.charanreddy.dev)** so it's in the portfolio
   grid.

---

## Troubleshooting

**404 on every route.** Output Directory isn't `site`. Check Project → Settings → General.

**Fonts don't load.** The pages request IBM Plex from Google Fonts with `preconnect`. If a
network blocks it, the CSS falls back to `ui-monospace` / `system-ui` — the layout holds, the
personality doesn't. To self-host, download the woff2 files into `site/fonts/` and swap the
`<link>` for a local `@font-face` block.

**Social card is blank.** `og.png` doesn't exist yet (step 6), or the URL in the meta tags
doesn't match the deployed domain. Both must be absolute.

**Vercel tries to run `tsc` and fails.** It's ignoring `vercel.json`. Confirm the file is at the
repo root and Root Directory is `./`, not `site`.
