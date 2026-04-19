# lenish.me (personal site)

Plain static HTML + CSS. No build step.

## Run locally

Double-click `index.html`, or:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Edit the content

- `index.html` — text and links. Replace the two `href="#"` placeholders in the header with your GitHub and LinkedIn URLs (marked with `TODO` comments).
- `style.css` — typography and spacing.
- `lenish_CV.pdf` — replace this file whenever you update your resume.

## Deploy

**GitHub Pages:** create a repo, push these files, enable Pages on the `main` branch root in repo settings.

**Netlify / Vercel:** drag the folder onto the dashboard, or connect the repo. No build command, publish directory is the repo root.
