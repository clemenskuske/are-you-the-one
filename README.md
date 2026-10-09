# Are You The One

An interactive matching board for previous Are You The One seasons.

Website: https://clemenskuske.github.io/are-you-the-one/

## Development

```bash
cd frontend
npm ci
npm run dev
```

The default development and production builds use the AWS API described in
`infra/README.md`. See `frontend/.env.example` for local API proxy settings.

## GitHub Pages

Pushes to `main` run the tests, lint the frontend, and publish it to GitHub Pages.
The Pages build exports the season source files in `data/` as JSON and copies
the cast images into the site, so the published site runs entirely on GitHub Pages.
Update the source files and push to publish updated season data.

To build and preview the Pages version locally:

```bash
cd frontend
VITE_BASE_PATH=/are-you-the-one/ npm run build:pages
npm run preview -- --base /are-you-the-one/
```

Open `http://localhost:4173/are-you-the-one/`.

## Checks

```bash
cd frontend
npm test
npm run lint
npm run build
```

The matching rules and season constraints are documented in `frontend/README.md`.
The optional AWS deployment lives in `infra/`.
