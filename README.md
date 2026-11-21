This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Skate progression app

The home screen and secondary screens use the dark, lime-accented mobile design and shared bottom navigation. Text fields use at least 16px text to prevent iPhone focus zoom. The PWA requests portrait orientation, and mobile landscape shows a rotate-back screen. The home screen shows the level/XP bar and only five daily checklist items: Mobility, Recovery, Japanese, Mind, and Character. Skate XP is awarded from logged skate sessions and skate progression benchmarks; workout XP is awarded when a workout is completed. Recovery check-ins remain available from the Log tab. The trick progression and cycle setup live at `/progress`; first-time skaters complete a baseline assessment before setting up their first cycle.

Add these values to `.env.local` to enable account sign-in and cloud sync:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Apply or re-run [`supabase/skate-progression.sql`](./supabase/skate-progression.sql) in the Supabase SQL Editor after updating the progression app. It creates the 84-trick catalog, signup seeding trigger, user progress tables, baseline-assessment and training-cycle RPCs, and Row Level Security policies. The migration also backfills progression rows for existing Auth users. New accounts receive 504 trick-tier progress rows and seven micro-skills. The four-step baseline appears for accounts without a completed baseline; baseline mastery backfills all lower tiers, and the summary calculates its starting level at 100 XP per progression score point using the existing level thresholds.

The Skill Tree also lets users save Day 1 and tier-complete YouTube links for each trick tier and compare them with embedded previews. Re-run the progression SQL to create the private video-links table; only the signed-in user can access their saved links.

The browser and Next.js Proxy use the Supabase SSR package to keep Auth cookies refreshed. The PWA manifest requests portrait orientation; a landscape reminder is shown on short landscape screens where browsers cannot enforce orientation.

## Supabase schema

Apply [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor when setting up or updating the database. Re-run it to add the season program, dated skate-practice and focus logs, benchmark history, and additional check-in fields. The update is additive: existing quest, skate-session, check-in, and workout rows are retained. The old quest-management and strength/flexibility benchmark screens are no longer exposed; historical rows remain in the database.

The ten season principles remain in the schema for historical data and existing benchmark/workout grouping. New skate cycles use the micro-skill catalog instead.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
