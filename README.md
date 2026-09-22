# Game Spec Requirement Checker

Game Spec Requirement Checker is a Next.js web app that compares a user's CPU, GPU, and RAM with PC game requirements from Steam and curated publisher catalogs.

The app uses ranked CPU and GPU catalogs to estimate whether a system meets minimum or recommended requirements, then explains likely bottlenecks with a compatibility score.

## Features

- Search Steam games through the Steam Store API.
- Display regional Steam pricing using the browser locale.
- Show original and discounted Steam prices when available.
- Mark curated non-Steam games as free.
- Parse and display minimum and recommended PC requirements.
- Compare CPU and GPU performance using ranked hardware lists.
- Compare RAM and CPU core requirements.
- Provide a compatibility progress bar and practical performance advice.
- Detect local hardware when the browser supports it.
- Persist the selected hardware locally in the browser.
- Responsive dark interface with accessible controls.

## Technology

<p>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white" alt="Next.js"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white" alt="React"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-3-06b6d4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-ready-black?logo=vercel&logoColor=white" alt="Vercel"></a>
</p>

- **Next.js App Router** for the application and server routes.
- **React** for the interactive interface.
- **TypeScript** for typed application and catalog logic.
- **Tailwind CSS** and custom CSS variables for styling.
- **Steam Store API** for game search, requirements, and regional prices.
- **Browser APIs** for hardware detection, locale detection, and local persistence.

## Requirements

- Node.js 18.17 or newer.
- npm.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm start
```

## Validation

```bash
npm run validate:hardware
npm run validate:games
```

`npm run build` also runs the TypeScript validation used by the production build.

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. Import the repository into [Vercel](https://vercel.com/).
3. Keep the default Next.js framework preset.
4. Deploy.

No environment variable is required for the current Steam integration. Steam requests are proxied through the included Next.js API routes:

- `/api/steam/search`
- `/api/steam/details`

The app sends a two-letter country code derived from the user's browser locale so Steam can return the appropriate regional currency and price.

## Project structure

```text
app/                 App Router pages, styles, and Steam API routes
components/          Reusable UI components
data/                Curated game requirement data
lib/                 Hardware catalogs, parsing, ranking, and comparison logic
public/               Game images, hero artwork, logo, and hardware guide video
scripts/              Catalog validation scripts
```

## Data and attribution

- Steam game metadata, requirements, images, and prices are supplied by Steam's public store endpoints.
- CPU and GPU rankings are stored in the repository's ranked catalog files and are used as the comparison source.
- Game artwork and trademarks remain the property of their respective owners.

## License

No license has been selected for this project yet. Add a license before accepting external contributions or redistributing the source.
