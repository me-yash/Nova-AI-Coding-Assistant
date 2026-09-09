# Nova Online — Free Cloud Edition 🕷️

Nova can run without Ollama on your laptop.

**Browser → Supabase Auth/Database → Supabase Edge Function → Gemini API**

Your laptop only handles the browser UI and local file reading for project context.

## What is online now?

- Cloud-synced conversations
- Email/password authentication
- Per-user chat isolation through Supabase RLS
- Gemini cloud inference
- Streaming AI responses
- Project/folder context from the browser
- No Ollama required
- No local SQLite database required for the online deployment
- GitHub Pages deployment workflow included

## Free-tier reality

Supabase has a $0 Free plan with quotas. Gemini Developer API also has a free tier for supported models, with usage/rate limits. This means the architecture can be run at $0 for normal personal use, but it is not unlimited free AI.

See `ONLINE-SETUP.md` for the exact setup.
