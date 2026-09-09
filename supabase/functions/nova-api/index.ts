const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("NOVA_GEMINI_MODEL") || "gemini-3.8-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MAX_HISTORY = 12;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authHeaders(auth: string) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: auth,
    "Content-Type": "application/json",
  };
}

async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Authentication required.");

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: auth,
    },
  });

  if (!response.ok) throw new Error("Your session is invalid or expired.");
  const user = await response.json();
  return { auth, user };
}

async function dbRequest(path: string, auth: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders(auth),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === "object" && data && "message" in data ? String((data as any).message) : `Database request failed (${response.status}).`);
  return { response, data };
}

function titleFrom(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 35 ? clean : `${clean.slice(0, 35)}...`;
}

const systemInstruction = (date: string, time: string) => `You are Nova, a personal AI coding assistant created by Yash Srivastava.

LIVE SYSTEM INFORMATION:
Current date: ${date}
Current time: ${time}
Timezone: Asia/Kolkata (India)

Your main purpose is helping with programming, frontend development, backend development, debugging, errors, databases, APIs, Git, deployment, React, React Native, and software development.

RULES:
- Reply in the same language as the user's latest message. For Hinglish, use natural Roman-script Hinglish.
- Prioritize the latest user message.
- Do not invent project files or bugs that were not provided.
- When project context is supplied, use it carefully and mention file paths when useful.
- When debugging, identify the confirmed issue first, then give the smallest practical fix.
- When code is requested, give clean, complete code.
- Be concise unless the user asks for detail.
- Never claim you executed code, deployed a project, or accessed a file unless the request context actually proves it.
- If a task depends on current external information, say that live web access is not available inside Nova unless the user provides the information.
`;

async function handle(req: Request) {
  const { auth, user } = await requireUser(req);
  const body = await req.json();
  const action = body.action;

  if (action === "health") {
    return json({ ok: true, mode: "online", provider: "Gemini", model: MODEL, userId: user.id });
  }

  if (action === "list_conversations") {
    const { data } = await dbRequest("conversations?select=id,title,created_at,updated_at&order=updated_at.desc", auth);
    return json(data || []);
  }

  if (action === "get_messages") {
    const id = encodeURIComponent(String(body.conversationId));
    const { data } = await dbRequest(`messages?select=id,role,content,created_at&conversation_id=eq.${id}&order=created_at.asc`, auth);
    return json(data || []);
  }

  if (action === "new_chat") {
    const { data } = await dbRequest("conversations", auth, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.id, title: "New Chat" }),
    });
    const row = Array.isArray(data) ? data[0] : data;
    return json({ success: true, conversationId: row.id });
  }

  if (action === "delete_conversation") {
    const id = encodeURIComponent(String(body.conversationId));
    await dbRequest(`conversations?id=eq.${id}`, auth, { method: "DELETE" });
    return json({ success: true });
  }

  if (action === "chat") {
    const rawMessage = String(body.message || "").trim();
    const displayMessage = String(body.displayMessage || rawMessage).trim();
    if (!rawMessage) return json({ error: "Message is required." }, 400);

    let conversationId = body.conversationId ? String(body.conversationId) : null;

    if (!conversationId) {
      const created = await dbRequest("conversations", auth, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: user.id, title: titleFrom(displayMessage) }),
      });
      conversationId = (Array.isArray(created.data) ? created.data[0] : created.data).id;
    }

    const existing = await dbRequest(`conversations?id=eq.${encodeURIComponent(conversationId)}&select=id,title`, auth);
    if (!Array.isArray(existing.data) || !existing.data[0]) return json({ error: "Conversation not found." }, 404);

    if (existing.data[0].title === "New Chat") {
      await dbRequest(`conversations?id=eq.${encodeURIComponent(conversationId)}`, auth, {
        method: "PATCH",
        body: JSON.stringify({ title: titleFrom(displayMessage), updated_at: new Date().toISOString() }),
      });
    }

    await dbRequest("messages", auth, {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId, user_id: user.id, role: "user", content: displayMessage }),
    });

    const history = await dbRequest(
      `messages?select=role,content&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.desc&limit=${MAX_HISTORY}`,
      auth,
    );

    const rows = Array.isArray(history.data) ? [...history.data].reverse() : [];
    if (rows.length && rows[rows.length - 1].role === "user") rows.pop();
    rows.push({ role: "user", content: rawMessage });

    const now = new Date();
    const date = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const time = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const contents = rows.map((item: any) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.content) }],
    }));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction(date, time) }] },
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      },
    );

    if (!geminiResponse.ok || !geminiResponse.body) {
      const errorText = await geminiResponse.text();
      return new Response(errorText || "Gemini request failed.", { status: geminiResponse.status || 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const conversationHeader = conversationId;
    let fullText = "";
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const text = parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
                if (text) {
                  fullText += text;
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // Ignore malformed partial SSE records.
              }
            }
          }
          if (fullText.trim()) {
            await dbRequest("messages", auth, {
              method: "POST",
              body: JSON.stringify({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: fullText }),
            });
            await dbRequest(`conversations?id=eq.${encodeURIComponent(conversationId)}`, auth, {
              method: "PATCH",
              body: JSON.stringify({ updated_at: new Date().toISOString() }),
            });
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Conversation-Id": conversationHeader,
      },
    });
  }

  return json({ error: "Unknown action." }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
