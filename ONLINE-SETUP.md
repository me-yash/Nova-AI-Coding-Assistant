# Nova Online — Free Setup

This version moves chat history to Supabase and AI inference to a Supabase Edge Function calling the Gemini Developer API. Your laptop only runs the browser; Ollama is not used by the online version.

## 1. Create a free Supabase project

Create a project at https://supabase.com/dashboard.

The Free plan currently includes 500 MB database, 1 GB file storage, 50,000 MAU and 500,000 Edge Function invocations. Free projects can pause after 1 week of inactivity.

## 2. Create the database

Open Supabase → SQL Editor → New query.

Paste the full contents of:

    supabase/schema.sql

and run it.

## 3. Get the browser configuration

Copy:

    public/config.js.example

as:

    public/config.js

Open Supabase → Settings → API and put your Project URL and Publishable Key into that file.

The publishable key is intended for client apps. NEVER put a Supabase secret/service-role key in `public/config.js`.

## 4. Get a free Gemini API key

Create a Gemini API key in Google AI Studio. The Gemini Developer API currently offers a free tier for supported models, including Gemini 3.8 Flash. Free usage has rate/usage limits.

## 5. Deploy the Edge Function

The Supabase CLI requires Node 20+ when installed/run through npm/npx.

From the Nova folder:

    npx supabase login
    npx supabase link --project-ref YOUR_PROJECT_ID
    npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    npx supabase secrets set NOVA_GEMINI_MODEL=gemini-3.8-flash
    npx supabase functions deploy nova-api --use-api

If the CLI asks for a database password while linking, use the password you created for the Supabase project.

## 6. Configure Auth redirects

Supabase → Authentication → URL Configuration.

For local testing, add:

    http://localhost:3000

For GitHub Pages, add your final Pages URL, for example:

    https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/

Email/password auth is used by the Nova Online login screen.

## 7. Put Nova online

### GitHub Pages

1. Create a GitHub repository.
2. Commit the Nova folder, including `public/config.js` (it only contains the public Supabase URL/key).
3. Push to `main`.
4. GitHub → Settings → Pages → Build and deployment → Source: GitHub Actions.
5. The included workflow deploys the `public/` site.

### Local browser test

The old `npm start` server is not needed for the online architecture. You can serve the `public/` folder with any static server, for example:

    npx serve public

Then open the URL it prints.

## Important

- Ollama is not used by Nova Online.
- `nova.db` is not used by Nova Online.
- Chat history lives in Supabase.
- The Gemini key stays inside the Supabase Edge Function secret store.
- Project files are read in the browser and sent as context only when you ask Nova about them; they are not automatically stored in Supabase by this version.
- Free tiers have quotas. This is free-tier architecture, not unlimited free AI.
