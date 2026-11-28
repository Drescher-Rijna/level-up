# Level Up

A mobile-first skateboarding training app for deliberate practice, alongside the existing workout flow and recovery log.

## Skate training

The skate area is organized into **Sessions**, **Cycles**, **Tricks**, and **Settings**:

- Generate a complete cycle from every eligible trick/stance combination, review its arrangement, then confirm it.
- Log landed attempts by set. Session results are saved as drafts and progression advances automatically when the benchmark is met in at least two sets.
- Manage per-stance eligibility and progression sequences without deleting historical practice or progression data.
- Create reusable meta-skills and level labels, and configure session defaults.

The seeded catalogue contains 25 tricks in five families, four stances, 12 editable meta-skills, and user-specific eligibility records. The default session settings are three sets, five attempts per set, and three landed attempts to pass a set.

## Development

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Set these values in `.env.local` to enable account sign-in and cloud sync:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Supabase setup

Apply [`supabase/schema.sql`](./supabase/schema.sql) for the workout and recovery tables, then apply [`supabase/skate-training.sql`](./supabase/skate-training.sql) for the skate training catalog, user data model, cycle/session RPCs, signup seeding, and Row Level Security policies. The skate migration backfills existing Auth users and is safe to re-run.

The older [`supabase/skate-progression.sql`](./supabase/skate-progression.sql) tables are retained for existing records, but the current skate interface uses the new skate-training schema.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```
