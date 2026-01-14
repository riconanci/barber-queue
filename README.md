# Barber Queue (Kiosk + Display + Staff)

## Setup
1. Create a Supabase project and copy keys into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
STAFF_PIN=1234
ADMIN_PIN=9999
```

2. Run the SQL in `supabase.sql` in the Supabase SQL editor.
3. Install deps and run:

```
npm install
npm run dev
```

## Routes
- `/kiosk` client check-in (first name + last initial + optional preferred barber)
- `/display` TV view (NOW UP + WAITING FOR + UP NEXT + ON DECK)
- `/staff` PIN-protected controls + settings

## Notes
- This starter uses permissive RLS policies (anon update) since you're not worried about trolling.
  When ready, tighten security by removing anon updates and doing staff writes through server-side
  Supabase service role only.
