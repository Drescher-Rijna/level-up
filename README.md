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

## Supabase schema

Apply [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor when setting up or updating the database. Re-run it to add the season program, dated skate-practice and focus logs, benchmark history, and additional check-in fields. The update is additive: existing quest, skate-session, check-in, and workout rows are retained. Existing active quest rows are marked as legacy history; their hours are not copied into the new 1,000-hour program.

The ten season principles are initialized per account. The seven existing principle names are retained, and the remaining three start as editable placeholders. Reordering and renaming are available only for unstarted quests; an active quest and completed seasons stay fixed. Focused time is recorded in minutes with each dated skate session and allocated to the active season, carrying session overage into the next season.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
