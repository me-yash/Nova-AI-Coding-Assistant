/* Nova Online bridge
   Supabase Auth + Edge Function + Gemini
   Keeps the existing Nova UI code working.
*/

(function () {
  const nativeFetch = window.fetch.bind(window);
  const config = window.NOVA_CONFIG;

  // --------------------------------------------------
  // Configuration check
  // --------------------------------------------------

  if (
    !config?.SUPABASE_URL ||
    !config?.SUPABASE_PUBLISHABLE_KEY ||
    config.SUPABASE_URL.includes("YOUR_PROJECT_ID")
  ) {
    document.addEventListener("DOMContentLoaded", () => {
      showSetupError();
    });
    return;
  }

  if (!window.supabase?.createClient) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = `
        <div style="
          min-height:100vh;
          display:grid;
          place-items:center;
          background:#07111f;
          color:#fff;
          font-family:Arial;
          padding:24px;
        ">
          <div style="
            max-width:620px;
            padding:28px;
            border:1px solid #25466d;
            border-radius:18px;
            background:#0b1a2d;
          ">
            <h1>Nova Online</h1>
            <p>Supabase library failed to load.</p>
          </div>
        </div>
      `;
    });
    return;
  }

  // --------------------------------------------------
  // Supabase
  // --------------------------------------------------

 const supabase = window.supabase.createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },

    global: {
      fetch: nativeFetch
    }
  }
);

  window.NOVA_SUPABASE = supabase;

  const functionUrl =
    `${config.SUPABASE_URL}/functions/v1/nova-api`;

  let sessionPromise = null;

  // --------------------------------------------------
  // Setup error
  // --------------------------------------------------

  function showSetupError() {
    document.body.innerHTML = `
      <div style="
        min-height:100vh;
        display:grid;
        place-items:center;
        background:#07111f;
        color:#fff;
        font-family:Arial;
        padding:24px;
      ">
        <div style="
          max-width:620px;
          padding:28px;
          border:1px solid #25466d;
          border-radius:18px;
          background:#0b1a2d;
          box-shadow:0 20px 80px #0008;
        ">
          <h1 style="margin:0 0 10px">
            Nova Online Setup
          </h1>

          <p style="
            color:#b8c9dc;
            line-height:1.6;
          ">
            Supabase configuration is missing.
            Check public/config.js.
          </p>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------
  // Authentication UI
  // --------------------------------------------------

  function ensureAuthUI() {
    if (document.getElementById("novaAuthOverlay")) {
      return;
    }

    const overlay = document.createElement("div");

    overlay.id = "novaAuthOverlay";

    overlay.innerHTML = `
      <div class="nova-auth-card">

        <div class="nova-auth-logo">
          N
        </div>

        <h1>
          Nova Online
        </h1>

        <p class="nova-auth-sub">
          Sign in to keep your chats synced in the cloud.
        </p>

        <form id="novaAuthForm">

          <input
            id="novaAuthEmail"
            type="email"
            placeholder="Email"
            autocomplete="email"
            required
          >

          <input
            id="novaAuthPassword"
            type="password"
            placeholder="Password (6+ characters)"
            autocomplete="current-password"
            minlength="6"
            required
          >

          <button
            id="novaAuthSubmit"
            type="submit"
          >
            Sign in
          </button>

        </form>

        <button
          id="novaAuthToggle"
          class="nova-auth-secondary"
          type="button"
        >
          Create account
        </button>

        <button
          id="novaAuthForgot"
          class="nova-auth-link"
          type="button"
        >
          Forgot password?
        </button>

        <p
          id="novaAuthStatus"
          class="nova-auth-status"
        ></p>

      </div>
    `;

    document.body.appendChild(overlay);

    const form =
      document.getElementById("novaAuthForm");

    const toggle =
      document.getElementById("novaAuthToggle");

    const submit =
      document.getElementById("novaAuthSubmit");

    const status =
      document.getElementById("novaAuthStatus");

    let signUp = false;

    // --------------------------------------------------
    // Status helper
    // --------------------------------------------------

    function setStatus(text, error = false) {
      status.textContent = text;
      status.classList.toggle("error", error);
    }

    // --------------------------------------------------
    // Toggle signup/login
    // --------------------------------------------------

    toggle.onclick = () => {
      signUp = !signUp;

      submit.textContent =
        signUp ? "Create account" : "Sign in";

      toggle.textContent =
        signUp
          ? "Already have an account? Sign in"
          : "Create account";

      setStatus("");

      const passwordInput =
        document.getElementById("novaAuthPassword");

      passwordInput.value = "";
    };

    // --------------------------------------------------
    // Forgot password
    // --------------------------------------------------

    document.getElementById(
      "novaAuthForgot"
    ).onclick = async () => {

      const email =
        document
          .getElementById("novaAuthEmail")
          .value
          .trim();

      if (!email) {
        return setStatus(
          "Enter your email first.",
          true
        );
      }

      setStatus("Sending reset email...");

      try {
        const { error } =
          await supabase.auth.resetPasswordForEmail(
            email,
            {
              redirectTo:
                window.location.origin +
                window.location.pathname
            }
          );

        if (error) {
          return setStatus(
            error.message,
            true
          );
        }

        setStatus(
          "Password reset email sent."
        );

      } catch (error) {

        setStatus(
          error?.message ||
          "Unable to send reset email.",
          true
        );
      }
    };

    // --------------------------------------------------
    // Login / Signup
    // --------------------------------------------------

    form.onsubmit = async (event) => {
  event.preventDefault();

  submit.disabled = true;

  const email = document
    .getElementById("novaAuthEmail")
    .value
    .trim();

  const password = document
    .getElementById("novaAuthPassword")
    .value;

  if (!email) {
    submit.disabled = false;
    return setStatus("Enter your email.", true);
  }

  if (!password || password.length < 6) {
    submit.disabled = false;
    return setStatus(
      "Password must be at least 6 characters.",
      true
    );
  }

  setStatus(
    signUp
      ? "Creating account..."
      : "Signing in..."
  );

  const authUrl = signUp
    ? `${config.SUPABASE_URL}/auth/v1/signup`
    : `${config.SUPABASE_URL}/auth/v1/token?grant_type=password`;

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await nativeFetch(authUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": config.SUPABASE_PUBLISHABLE_KEY
      },

      body: JSON.stringify({
        email,
        password
      }),

      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      submit.disabled = false;

      const message =
        data?.msg ||
        data?.message ||
        data?.error_description ||
        data?.error ||
        `Authentication failed (${response.status}).`;

      return setStatus(message, true);
    }

    // SIGN UP
    if (signUp) {
      if (
        data?.access_token &&
        data?.refresh_token
      ) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });

        submit.disabled = false;
        hideAuth();

        return;
      }

      submit.disabled = false;

      return setStatus(
        "Account created. Check your email to confirm it, then sign in."
      );
    }

    // SIGN IN
    if (
      data?.access_token &&
      data?.refresh_token
    ) {
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });

      submit.disabled = false;
      hideAuth();

      return;
    }

    submit.disabled = false;

    return setStatus(
      "Login failed. No session received.",
      true
    );

  } catch (error) {
    clearTimeout(timeoutId);

    submit.disabled = false;

    if (error?.name === "AbortError") {
      return setStatus(
        "Supabase connection timed out. Please try again.",
        true
      );
    }

    return setStatus(
      error?.message ||
      "Unable to connect to Supabase.",
      true
    );
  }
};
  }

  // --------------------------------------------------
  // Show / Hide Auth
  // --------------------------------------------------

  function showAuth() {

    ensureAuthUI();

    const overlay =
      document.getElementById(
        "novaAuthOverlay"
      );

    if (overlay) {
      overlay.classList.remove("hidden");
    }
  }

  function hideAuth() {

    const overlay =
      document.getElementById(
        "novaAuthOverlay"
      );

    if (overlay) {
      overlay.classList.add("hidden");
    }
  }

  // --------------------------------------------------
  // Get current session
  // --------------------------------------------------

  async function getSession() {

    const { data } =
      await supabase.auth.getSession();

    if (data?.session) {

      hideAuth();

      return data.session;
    }

    showAuth();

    return await new Promise(
      (resolve) => {
        sessionPromise = resolve;
      }
    );
  }

  // --------------------------------------------------
  // Auth state changes
  // --------------------------------------------------

  supabase.auth.onAuthStateChange(
    (_event, nextSession) => {

      if (nextSession) {

        hideAuth();

        if (sessionPromise) {

          sessionPromise(nextSession);

          sessionPromise = null;
        }

      } else {

        showAuth();
      }
    }
  );

  // --------------------------------------------------
  // Online API bridge
  // --------------------------------------------------

  async function onlineFetch(
    path,
    options = {}
  ) {

    const session =
      await getSession();

    if (!session) {
      return new Response(
        JSON.stringify({
          error: "Authentication required"
        }),
        {
          status: 401,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    const headers =
      new Headers(
        options.headers || {}
      );

    headers.set(
      "Authorization",
      `Bearer ${session.access_token}`
    );

    headers.set(
      "apikey",
      config.SUPABASE_PUBLISHABLE_KEY
    );

    const url =
      new URL(
        path,
        window.location.origin
      );

    const pathname =
      url.pathname;

    let action = "";
    let payload = {};

    // --------------------------------------------------
    // Health
    // --------------------------------------------------

    if (pathname === "/health") {

      action = "health";

    }

    // --------------------------------------------------
    // Conversations
    // --------------------------------------------------

    else if (
      pathname === "/conversations" &&
      (!options.method ||
        options.method === "GET")
    ) {

      action = "list_conversations";

    }

    // --------------------------------------------------
    // New chat
    // --------------------------------------------------

    else if (
      pathname === "/new-chat"
    ) {

      action = "new_chat";

    }

    // --------------------------------------------------
    // Chat
    // --------------------------------------------------

    else if (
      pathname === "/chat"
    ) {

      action = "chat";

      try {

        payload =
          options.body
            ? JSON.parse(options.body)
            : {};

      } catch {

        return new Response(
          JSON.stringify({
            error: "Invalid request body"
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }
    }

    // --------------------------------------------------
    // Messages
    // --------------------------------------------------

    else if (
      pathname.startsWith(
        "/conversations/"
      ) &&
      pathname.endsWith(
        "/messages"
      )
    ) {

      action = "get_messages";

      const parts =
        pathname.split("/");

      payload.conversationId =
        decodeURIComponent(parts[2]);

    }

    // --------------------------------------------------
    // Delete conversation
    // --------------------------------------------------

    else if (
      pathname.startsWith(
        "/conversations/"
      ) &&
      (options.method || "GET") ===
        "DELETE"
    ) {

      action =
        "delete_conversation";

      payload.conversationId =
        decodeURIComponent(
          pathname.split("/")[2]
        );
    }

    // --------------------------------------------------
    // File upload
    // --------------------------------------------------

    else if (
      pathname === "/upload-file"
    ) {

      const form =
        options.body;

      const file =
        form instanceof FormData
          ? form.get("file")
          : null;

      if (!(file instanceof File)) {

        return new Response(
          JSON.stringify({
            error:
              "No file uploaded"
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }

      const allowed = [
        ".html",
        ".css",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".json",
        ".py",
        ".java",
        ".c",
        ".cpp",
        ".cs",
        ".php",
        ".sql",
        ".md",
        ".txt"
      ];

      const dot =
        file.name.lastIndexOf(".");

      const ext =
        dot >= 0
          ? file.name
              .slice(dot)
              .toLowerCase()
          : "";

      if (!allowed.includes(ext)) {

        return new Response(
          JSON.stringify({
            error:
              "This file type is not supported yet."
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }

      if (
        file.size >
        1024 * 1024
      ) {

        return new Response(
          JSON.stringify({
            error:
              "File is larger than 1 MB."
          }),
          {
            status: 400,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }

      const content =
        await file.text();

      return new Response(
        JSON.stringify({
          success: true,
          fileName: file.name,
          content,
          size: file.size,
          characters:
            content.length,
          lines:
            content.split("\n").length
        }),
        {
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    // --------------------------------------------------
    // Unknown endpoint
    // --------------------------------------------------

    else {

      return nativeFetch(
        path,
        options
      );
    }

    // --------------------------------------------------
    // Send request to Edge Function
    // --------------------------------------------------

    const body =
      JSON.stringify({
        action,
        ...payload
      });

    const response =
      await nativeFetch(
        functionUrl,
        {
          method: "POST",

          headers: {
            ...Object.fromEntries(
              headers.entries()
            ),
            "Content-Type":
              "application/json"
          },

          body,

          signal:
            options.signal
        }
      );

    return response;
  }

  // --------------------------------------------------
  // Replace local fetch with online bridge
  // --------------------------------------------------

  window.fetch =
    onlineFetch;

  // --------------------------------------------------
  // Page initialization
  // --------------------------------------------------

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      ensureAuthUI();

      const statusArea =
        document.querySelector(
          ".status"
        );

      if (statusArea) {

        statusArea.innerHTML = `
          <span class="status-dot"></span>
          Online AI
          <button
            id="novaLogout"
            class="nova-logout"
          >
            Logout
          </button>
        `;
      }

      document.addEventListener(
        "click",
        async (event) => {

          if (
            event.target?.id ===
            "novaLogout"
          ) {

            await supabase.auth.signOut();
          }
        }
      );
    }
  );

})();