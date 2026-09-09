/* Nova Online bridge: keeps the existing UI code intact while replacing the local
   Express/Ollama layer with Supabase Auth + Edge Function + Gemini. */
(function () {
  const nativeFetch = window.fetch.bind(window);
  const config = window.NOVA_CONFIG;
  if (!config?.SUPABASE_URL || !config?.SUPABASE_PUBLISHABLE_KEY || config.SUPABASE_URL.includes("YOUR_PROJECT_ID")) {
    document.addEventListener("DOMContentLoaded", () => showSetupError());
    return;
  }

  const supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.NOVA_SUPABASE = supabase;
  const functionUrl = `${config.SUPABASE_URL}/functions/v1/nova-api`;

  let sessionPromise = null;

  function showSetupError() {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;background:#07111f;color:#fff;font-family:Arial;padding:24px">
        <div style="max-width:620px;padding:28px;border:1px solid #25466d;border-radius:18px;background:#0b1a2d;box-shadow:0 20px 80px #0008">
          <h1 style="margin:0 0 10px">🕷️ Nova Online Setup</h1>
          <p style="color:#b8c9dc;line-height:1.6">Create <code>public/config.js</code> from <code>public/config.js.example</code>, then add your Supabase Project URL and Publishable Key.</p>
        </div>
      </div>`;
  }

  function ensureAuthUI() {
    if (document.getElementById("novaAuthOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "novaAuthOverlay";
    overlay.innerHTML = `
      <div class="nova-auth-card">
        <div class="nova-auth-logo">N</div>
        <h1>Nova Online</h1>
        <p class="nova-auth-sub">Sign in to keep your chats synced in the cloud.</p>
        <form id="novaAuthForm">
          <input id="novaAuthEmail" type="email" placeholder="Email" autocomplete="email" required>
          <input id="novaAuthPassword" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" minlength="6" required>
          <button id="novaAuthSubmit" type="submit">Sign in</button>
        </form>
        <button id="novaAuthToggle" class="nova-auth-secondary" type="button">Create account</button>
        <button id="novaAuthForgot" class="nova-auth-link" type="button">Forgot password?</button>
        <p id="novaAuthStatus" class="nova-auth-status"></p>
      </div>`;
    document.body.appendChild(overlay);
    const form = document.getElementById("novaAuthForm");
    const toggle = document.getElementById("novaAuthToggle");
    const submit = document.getElementById("novaAuthSubmit");
    const status = document.getElementById("novaAuthStatus");
    let signUp = false;

    const setStatus = (text, error = false) => {
      status.textContent = text;
      status.classList.toggle("error", error);
    };

    toggle.onclick = () => {
      signUp = !signUp;
      submit.textContent = signUp ? "Create account" : "Sign in";
      toggle.textContent = signUp ? "Already have an account? Sign in" : "Create account";
      setStatus("");
    };

    document.getElementById("novaAuthForgot").onclick = async () => {
      const email = document.getElementById("novaAuthEmail").value.trim();
      if (!email) return setStatus("Enter your email first.", true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setStatus(error ? error.message : "Password reset email sent.");
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      setStatus("Working...");
      const email = document.getElementById("novaAuthEmail").value.trim();
      const password = document.getElementById("novaAuthPassword").value;
      let result;

try {
  result = signUp
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
} catch (error) {
  submit.disabled = false;
  return setStatus(error?.message || "Authentication failed.", true);
}
      submit.disabled = false;
      if (result.error) return setStatus(result.error.message, true);
      if (signUp && !result.data.session) return setStatus("Account created. Check your email to confirm it, then sign in.");
      hideAuth();
    };
  }

  function showAuth() {
    ensureAuthUI();
    document.getElementById("novaAuthOverlay").classList.remove("hidden");
  }
  function hideAuth() {
    const el = document.getElementById("novaAuthOverlay");
    if (el) el.classList.add("hidden");
  }

  async function getSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) { hideAuth(); return data.session; }
    showAuth();
    return await new Promise((resolve) => {
      sessionPromise = resolve;
    });
  }

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (nextSession) {
      hideAuth();
      if (sessionPromise) { sessionPromise(nextSession); sessionPromise = null; }
    } else {
      showAuth();
    }
  });

  async function onlineFetch(path, options = {}) {
    const session = await getSession();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${session.access_token}`);
    headers.set("apikey", config.SUPABASE_PUBLISHABLE_KEY);

    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    let action = "";
    let payload = {};

    if (pathname === "/health") {
      action = "health";
    } else if (pathname === "/conversations" && (!options.method || options.method === "GET")) {
      action = "list_conversations";
    } else if (pathname === "/new-chat") {
      action = "new_chat";
    } else if (pathname === "/chat") {
      action = "chat";
      payload = options.body ? JSON.parse(options.body) : {};
    } else if (pathname.startsWith("/conversations/") && pathname.endsWith("/messages")) {
      action = "get_messages";
      const parts = pathname.split("/");
      payload.conversationId = decodeURIComponent(parts[2]);
    } else if (pathname.startsWith("/conversations/") && (options.method || "GET") === "DELETE") {
      action = "delete_conversation";
      payload.conversationId = decodeURIComponent(pathname.split("/")[2]);
    } else if (pathname === "/upload-file") {
      // Existing UI expects the old endpoint, but file reading can happen entirely in the browser.
      const form = options.body;
      const file = form instanceof FormData ? form.get("file") : null;
      if (!(file instanceof File)) return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const allowed = [".html",".css",".js",".jsx",".ts",".tsx",".json",".py",".java",".c",".cpp",".cs",".php",".sql",".md",".txt"];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowed.includes(ext)) return new Response(JSON.stringify({ error: "This file type is not supported yet." }), { status: 400, headers: { "Content-Type": "application/json" } });
      if (file.size > 1024 * 1024) return new Response(JSON.stringify({ error: "File is larger than 1 MB." }), { status: 400, headers: { "Content-Type": "application/json" } });
      const content = await file.text();
      return new Response(JSON.stringify({ success: true, fileName: file.name, content, size: file.size, characters: content.length, lines: content.split("\n").length }), { headers: { "Content-Type": "application/json" } });
    } else {
      return nativeFetch(path, options);
    }

    const body = JSON.stringify({ action, ...payload });
    const response = await nativeFetch(functionUrl, {
      method: "POST",
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json" },
      body,
      signal: options.signal
    });
    return response;
  }

  window.fetch = onlineFetch;

  document.addEventListener("DOMContentLoaded", () => {
    ensureAuthUI();
    const statusArea = document.querySelector(".status");
    if (statusArea) statusArea.innerHTML = `<span class="status-dot"></span> Online AI <button id="novaLogout" class="nova-logout">Logout</button>`;
    document.addEventListener("click", async (event) => {
      if (event.target.id === "novaLogout") await supabase.auth.signOut();
    });
  });
})();
