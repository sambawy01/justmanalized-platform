/* Just Manalized — concierge chat widget (vanilla JS, no dependencies) */
(() => {
  "use strict";

  // Update if the deployment URL changes.
  const CHAT_ENDPOINT =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "http://localhost:3000/api/chat"
      : "https://shop.justmanalized.com/api/chat";

  const CONTACT_EMAIL = "hello@justmanalized.com";
  const SHOP_URL = "shop.html";

  const T = {
    open: "Open chat with the Just Manalized concierge",
    close: "Close chat",
    title: "Just Manalized Concierge",
    placeholder: "Your question…",
    send: "Send",
    greeting: "Hi! I'm the Just Manalized concierge. Ask me anything about our hats, sizing, materials, or your order.",
    teaserName: "Need a hand?",
    teaserLine: "Ask about our hats, sizing & orders",
    teaserDismiss: "Dismiss",
    fallbackPre: "I'm offline right now — email ",
    fallbackMid: " or ",
    fallbackBook: "browse the shop",
  };

  const STORE_KEY = "jm-chat-history";
  const MAX_HISTORY = 12;

  const loadHistory = () => {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || []; }
    catch { return []; }
  };
  const saveHistory = (h) => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); }
    catch { /* private mode — ignore */ }
  };

  let history = loadHistory();
  let open = false, greeted = false, waiting = false;

  // ---- DOM ----
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  // Launcher: a flat earthy-clay boho mark — a hand-drawn celestial sun cradling
  // a warm terracotta "M" (the concierge's mark). No gold, no gloss, no flare:
  // a single flat clay fill + faded ochre sun rays, all hand-drawn line-art.
  const launcher = el("button", "chat-launcher", { type: "button", "aria-label": T.open, "aria-expanded": "false" });
  launcher.innerHTML =
    '<svg viewBox="0 0 64 64" width="50" height="50" aria-hidden="true" focusable="false">' +
      // sun rays — faded ochre hand-drawn line-art, celestial boho halo
      '<g fill="none" stroke="#C9763F" stroke-width="2.4" stroke-linecap="round" opacity="0.55">' +
        '<line x1="32" y1="5" x2="32" y2="12"/>' +
        '<line x1="32" y1="52" x2="32" y2="59"/>' +
        '<line x1="5" y1="32" x2="12" y2="32"/>' +
        '<line x1="52" y1="32" x2="59" y2="32"/>' +
        '<line x1="13.2" y1="13.2" x2="18.1" y2="18.1"/>' +
        '<line x1="45.9" y1="45.9" x2="50.8" y2="50.8"/>' +
        '<line x1="50.8" y1="13.2" x2="45.9" y2="18.1"/>' +
        '<line x1="18.1" y1="45.9" x2="13.2" y2="50.8"/>' +
      '</g>' +
      // flat terracotta "M" — single earthy clay fill, characterful boho serif
      '<text x="32" y="42" text-anchor="middle" font-family="\'Yeseva One\', Georgia, serif" font-weight="400" font-size="34" fill="#B5562F">M</text>' +
    '</svg>';

  const card = el("section", "chat-card", { role: "dialog", "aria-label": T.title, hidden: "" });

  const header = el("header", "chat-header");
  const title = el("h3", "chat-title");
  title.textContent = T.title;
  const closeBtn = el("button", "chat-close", { type: "button", "aria-label": T.close });
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  header.append(title, closeBtn);

  const list = el("div", "chat-messages", { "aria-live": "polite" });

  const form = el("form", "chat-input");
  const input = el("input", "", { type: "text", placeholder: T.placeholder, "aria-label": T.placeholder, autocomplete: "off" });
  const sendBtn = el("button", "chat-send", { type: "submit", "aria-label": T.send });
  sendBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  form.append(input, sendBtn);

  card.append(header, list, form);

  // ---- Intro teaser: greets on every new visit; once dismissed or the chat is
  // opened it stays away for the rest of the browsing session (sessionStorage,
  // not localStorage — keep the concierge hard to miss for returning visitors). ----
  const INTRO_KEY = "jm-concierge-intro-seen";
  const introSeen = () => {
    try { return sessionStorage.getItem(INTRO_KEY) === "1"; }
    catch { return true; } // storage unavailable — stay quiet rather than nag on every load
  };
  const markIntroSeen = () => {
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ }
  };

  const teaser = el("aside", "chat-teaser", { hidden: "" });
  const teaserBody = el("button", "chat-teaser-body", { type: "button", "aria-label": T.open });
  const teaserName = el("strong", "chat-teaser-name");
  teaserName.textContent = T.teaserName;
  const teaserLine = el("span", "chat-teaser-line");
  teaserLine.textContent = T.teaserLine;
  teaserBody.append(teaserName, teaserLine);
  const teaserClose = el("button", "chat-teaser-close", { type: "button", "aria-label": T.teaserDismiss });
  teaserClose.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  teaser.append(teaserBody, teaserClose);

  document.body.append(launcher, teaser, card);

  const hideTeaser = () => {
    if (teaser.hidden) return;
    teaser.classList.remove("show");
    teaser.hidden = true;
    markIntroSeen();
  };

  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!introSeen()) {
    setTimeout(() => {
      if (open) return; // chat already opened — no need to introduce
      teaser.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => teaser.classList.add("show")));
    }, REDUCED ? 0 : 1500);
  } else {
    launcher.classList.add("calm"); // returning visitor — no pulse ring
  }

  teaserClose.addEventListener("click", hideTeaser);

  // ---- Safe rendering: text nodes only, URLs linkified into real anchors ----
  const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
  const renderText = (node, text) => {
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      if (m.index > last) node.append(text.slice(last, m.index));
      const a = el("a", "chat-link", { href: m[0], target: "_blank", rel: "noopener noreferrer" });
      a.textContent = m[0];
      node.append(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) node.append(text.slice(last));
  };

  const addBubble = (role, text) => {
    const b = el("div", "chat-bubble chat-" + role);
    renderText(b, text);
    list.append(b);
    list.scrollTop = list.scrollHeight;
    return b;
  };

  // Offline fallback bubble: trusted local strings + labeled email/booking anchors.
  const addFallback = () => {
    const b = el("div", "chat-bubble chat-assistant");
    b.append(T.fallbackPre);
    const mail = el("a", "chat-link", { href: "mailto:" + CONTACT_EMAIL });
    mail.textContent = CONTACT_EMAIL;
    const book = el("a", "chat-link", { href: SHOP_URL, rel: "noopener noreferrer" });
    book.textContent = T.fallbackBook;
    b.append(mail, T.fallbackMid, book, ".");
    list.append(b);
    list.scrollTop = list.scrollHeight;
  };

  let typingEl = null;
  const showTyping = (on) => {
    if (on && !typingEl) {
      typingEl = el("div", "chat-bubble chat-assistant chat-typing", { "aria-hidden": "true" });
      typingEl.innerHTML = "<span></span><span></span><span></span>";
      list.append(typingEl);
      list.scrollTop = list.scrollHeight;
    } else if (!on && typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  };

  // ---- Open / close ----
  const setOpen = (v) => {
    open = v;
    card.hidden = !v;
    launcher.setAttribute("aria-expanded", String(v));
    if (v) {
      hideTeaser();
      markIntroSeen();
      launcher.classList.add("calm"); // pulse ring retires after the first open
      if (!greeted) {
        greeted = true;
        if (history.length) history.forEach((m) => addBubble(m.role, m.content));
        else addBubble("assistant", T.greeting); // greeting only — never sent to the API
      }
      input.focus();
      list.scrollTop = list.scrollHeight;
    } else {
      launcher.focus();
    }
  };

  launcher.addEventListener("click", () => setOpen(!open));
  teaserBody.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  card.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  // Public hook: any [data-open-chat] element opens the chat card.
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-open-chat]");
    if (!t) return;
    e.preventDefault();
    setOpen(true);
    card.scrollIntoView({ block: "nearest" });
  });

  // ---- Send ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || waiting) return;
    input.value = "";

    addBubble("user", text);
    history.push({ role: "user", content: text });
    saveHistory(history);

    waiting = true;
    sendBtn.disabled = true;
    showTyping(true);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY), lang: "en" }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const reply = (await res.json()).reply;
      if (typeof reply !== "string" || !reply) throw new Error("bad payload");
      history.push({ role: "assistant", content: reply });
      saveHistory(history);
      showTyping(false);
      addBubble("assistant", reply);
    } catch {
      showTyping(false);
      addFallback(); // graceful offline fallback — not stored in history
    }

    waiting = false;
    sendBtn.disabled = false;
    input.focus();
  });
})();
