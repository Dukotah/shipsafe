/* ShipSafe — client-side accessibility + privacy + schema risk checker.
   Fetches the target page HTML via a CORS-proxy fallback chain and analyzes the source. */

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

const $ = (s) => document.querySelector(s);

function normalizeUrl(raw) {
  let s = (raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return new URL(s); } catch { return null; }
}

async function fetchHTML(url) {
  for (const proxy of PROXIES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 16000);
      const res = await fetch(proxy(url), { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.replace(/\s/g, "").length > 80) return text;
    } catch { /* try next proxy */ }
  }
  throw new Error("fetch-failed");
}

// --- accessible-name helper -------------------------------------------------
function accName(el) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (t) return t;
  if (el.getAttribute("aria-label")?.trim()) return el.getAttribute("aria-label").trim();
  if (el.getAttribute("aria-labelledby")?.trim()) return "(labelledby)";
  if (el.getAttribute("title")?.trim()) return el.getAttribute("title").trim();
  const img = el.querySelector("img[alt]");
  if (img && img.getAttribute("alt").trim()) return img.getAttribute("alt").trim();
  if (el.querySelector("svg [aria-label], svg title")) return "(svg label)";
  return "";
}

// --- the check battery ------------------------------------------------------
// Each returns {status: pass|warn|fail|info, detail, fix, law}
const CHECKS = {
  accessibility: [
    ["Page language declared", (c) => {
      const lang = c.doc.documentElement.getAttribute("lang");
      return lang && lang.trim()
        ? { status: "pass", detail: `lang="${lang}"` }
        : { status: "fail", detail: "The <html> tag has no lang attribute.", fix: 'Add a language to your <html> tag, e.g. <html lang="en">. Screen readers need it to pronounce your page.', law: "WCAG 3.1.1" };
    }],
    ["Images have alt text", (c) => {
      const imgs = [...c.doc.querySelectorAll("img")];
      if (!imgs.length) return { status: "info", detail: "No <img> elements found in the source." };
      const missing = imgs.filter((i) => !i.hasAttribute("alt"));
      return missing.length
        ? { status: "fail", detail: `${missing.length} of ${imgs.length} images have no alt attribute.`, fix: 'Add alt="" to decorative images and a short description to meaningful ones. Missing alt text is the single most-cited ADA issue.', law: "WCAG 1.1.1" }
        : { status: "pass", detail: `All ${imgs.length} images have an alt attribute.` };
    }],
    ["Form fields are labeled", (c) => {
      const fields = [...c.doc.querySelectorAll("input,select,textarea")].filter((el) => {
        const type = (el.getAttribute("type") || "").toLowerCase();
        return !["hidden", "submit", "button", "image", "reset"].includes(type);
      });
      if (!fields.length) return { status: "info", detail: "No form fields found in the source." };
      const unlabeled = fields.filter((el) => {
        if (el.getAttribute("aria-label")?.trim() || el.getAttribute("aria-labelledby")?.trim() || el.getAttribute("title")?.trim()) return false;
        if (el.id && c.doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        if (el.closest("label")) return false;
        return true;
      });
      return unlabeled.length
        ? { status: "fail", detail: `${unlabeled.length} of ${fields.length} form fields have no associated label.`, fix: "Give every input a <label for> (or aria-label). A placeholder is NOT a label. Unlabeled fields fail WCAG and confuse screen readers.", law: "WCAG 1.3.1 / 4.1.2" }
        : { status: "pass", detail: `All ${fields.length} form fields are labeled.` };
    }],
    ["Links & buttons have accessible names", (c) => {
      const controls = [...c.doc.querySelectorAll("a[href],button")];
      if (!controls.length) return { status: "info", detail: "No links or buttons found." };
      const empty = controls.filter((el) => !accName(el));
      return empty.length
        ? { status: "fail", detail: `${empty.length} of ${controls.length} links/buttons have no readable text or label (e.g. icon-only buttons).`, fix: "Give icon-only buttons an aria-label, and make link text descriptive. A control a screen reader can't announce is unusable.", law: "WCAG 4.1.2 / 2.4.4" }
        : { status: "pass", detail: `All ${controls.length} links/buttons have an accessible name.` };
    }],
    ["Page has a title", (c) => {
      const t = (c.doc.title || "").trim();
      return t ? { status: "pass", detail: `"${t.slice(0, 70)}"` }
        : { status: "fail", detail: "The page has no <title>.", fix: "Add a descriptive <title>. It's the first thing a screen reader announces and your search-result headline.", law: "WCAG 2.4.2" };
    }],
    ["Heading structure", (c) => {
      const h1 = c.doc.querySelectorAll("h1").length;
      if (h1 === 0) return { status: "warn", detail: "No <h1> found.", fix: "Add exactly one <h1> describing the page. Headings are how screen-reader users navigate.", law: "WCAG 1.3.1" };
      if (h1 > 1) return { status: "warn", detail: `${h1} <h1> elements found — there should be one.`, fix: "Use a single <h1>, then <h2>/<h3> for subsections.", law: "WCAG 1.3.1" };
      return { status: "pass", detail: "Exactly one <h1>." };
    }],
    ["Mobile viewport set", (c) => {
      const vp = c.doc.querySelector('meta[name="viewport"]');
      return vp ? { status: "pass", detail: "Responsive viewport meta present." }
        : { status: "warn", detail: "No viewport meta tag.", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so the site is usable (and zoomable) on phones.', law: "WCAG 1.4.10" };
    }],
    ["Main landmark", (c) => {
      const main = c.doc.querySelector('main,[role="main"]');
      return main ? { status: "pass", detail: "<main> landmark present." }
        : { status: "warn", detail: "No <main> landmark.", fix: "Wrap your primary content in <main> so assistive tech can skip straight to it.", law: "WCAG 1.3.1" };
    }],
  ],
  privacy: [
    ["Privacy policy linked", (c) => {
      const has = [...c.doc.querySelectorAll("a")].some((a) => /privacy/i.test(a.textContent) || /privacy/i.test(a.getAttribute("href") || ""));
      return has ? { status: "pass", detail: "A privacy-policy link was found." }
        : { status: "fail", detail: "No privacy-policy link found.", fix: "Publish a privacy policy and link it in your footer. Required under CCPA/GDPR if you collect ANY data — and frequently bundled into ADA complaints.", law: "CCPA / GDPR" };
    }],
    ["Cookie / consent notice", (c) => {
      const html = c.html.toLowerCase();
      const cmp = /cookiebot|onetrust|osano|termly|cookieyes|iubenda|usercentrics|klaro|cookie-consent|cookieconsent/.test(html);
      const trackers = /googletagmanager|gtag\(|google-analytics|fbevents|fbq\(|hotjar|clarity\.ms|mixpanel|segment\.com/.test(html);
      const banner = /cookie/.test(html) && /(accept|consent|agree|preferences|reject)/.test(html);
      if (cmp || banner) return { status: "pass", detail: "A cookie/consent mechanism appears to be present." };
      if (trackers) return { status: "fail", detail: "Analytics/tracking scripts were found but no cookie-consent notice.", fix: "You're loading trackers (GA, Meta Pixel, etc.) with no consent banner — a direct GDPR/CCPA exposure. Add a consent notice or remove the trackers.", law: "GDPR / ePrivacy" };
      return { status: "info", detail: "No obvious trackers and no consent banner — likely fine for a static site." };
    }],
    ["Terms of service linked", (c) => {
      const has = [...c.doc.querySelectorAll("a")].some((a) => /terms|conditions/i.test(a.textContent) || /terms|conditions/i.test(a.getAttribute("href") || ""));
      return has ? { status: "pass", detail: "A terms/conditions link was found." }
        : { status: "warn", detail: "No terms-of-service link found.", fix: "Add a Terms of Service link, especially if users can sign up, buy, or submit content." };
    }],
    ["Contact path", (c) => {
      const has = [...c.doc.querySelectorAll("a")].some((a) => /^mailto:/i.test(a.getAttribute("href") || "") || /contact/i.test(a.textContent) || /contact/i.test(a.getAttribute("href") || ""));
      return has ? { status: "pass", detail: "A contact link or email was found." }
        : { status: "warn", detail: "No contact link or email found.", fix: "Give visitors a way to reach you (a contact page or mailto link). Its absence is a trust and sometimes a legal red flag." };
    }],
    ["Accessibility statement", (c) => {
      const has = [...c.doc.querySelectorAll("a")].some((a) => /accessib/i.test(a.textContent) || /accessib/i.test(a.getAttribute("href") || ""));
      return has ? { status: "pass", detail: "An accessibility statement link was found." }
        : { status: "warn", detail: "No accessibility statement.", fix: "Publish an accessibility statement with a contact for issues. It signals good-faith effort and is shown to reduce demand-letter risk." };
    }],
  ],
  schema: [
    ["Structured data (schema.org)", (c) => {
      const blocks = [...c.doc.querySelectorAll('script[type="application/ld+json"]')];
      if (!blocks.length) return { status: "warn", detail: "No JSON-LD structured data found.", fix: "Add schema.org JSON-LD (Organization, WebSite, Product, etc.) so Google can show rich results.", law: "SEO" };
      const broken = blocks.filter((b) => { try { JSON.parse(b.textContent); return false; } catch { return true; } });
      return broken.length
        ? { status: "fail", detail: `${broken.length} of ${blocks.length} JSON-LD blocks contain invalid JSON.`, fix: "A broken JSON-LD block is ignored by Google — validate it. Often a stray comma or unescaped quote.", law: "SEO" }
        : { status: "pass", detail: `${blocks.length} valid JSON-LD block(s).` };
    }],
    ["Meta description", (c) => {
      const m = c.doc.querySelector('meta[name="description"]');
      const v = m && m.getAttribute("content")?.trim();
      return v ? { status: "pass", detail: `${v.length} characters.` }
        : { status: "warn", detail: "No meta description.", fix: "Add a 120–160 char meta description — it's your search-result pitch.", law: "SEO" };
    }],
    ["Open Graph tags", (c) => {
      const ogt = c.doc.querySelector('meta[property="og:title"]');
      const ogi = c.doc.querySelector('meta[property="og:image"]');
      if (ogt && ogi) return { status: "pass", detail: "og:title and og:image present." };
      return { status: "warn", detail: `Missing ${[!ogt && "og:title", !ogi && "og:image"].filter(Boolean).join(" + ")}.`, fix: "Add Open Graph tags so links shared on social/text show a title + preview image instead of a blank box.", law: "SEO" };
    }],
    ["Canonical URL", (c) => {
      const can = c.doc.querySelector('link[rel="canonical"]');
      return can ? { status: "pass", detail: "Canonical link present." }
        : { status: "info", detail: "No canonical link (fine for a single-page site)." };
    }],
  ],
  trust: [
    ["HTTPS", (c) => c.u.protocol === "https:"
      ? { status: "pass", detail: "Served over HTTPS." }
      : { status: "fail", detail: "Site is not using HTTPS.", fix: "Serve over HTTPS — browsers flag HTTP sites as 'Not secure' and it tanks trust and SEO.", law: "Security" }],
    ["Favicon", (c) => {
      const fav = c.doc.querySelector('link[rel~="icon"],link[rel="shortcut icon"]');
      return fav ? { status: "pass", detail: "Favicon declared." }
        : { status: "info", detail: "No favicon — minor, but it makes tabs and bookmarks look unfinished." };
    }],
    ["No mixed content", (c) => {
      if (c.u.protocol !== "https:") return { status: "info", detail: "N/A (site is not HTTPS)." };
      const refs = [...c.doc.querySelectorAll("[src],[href]")].map((e) => e.getAttribute("src") || e.getAttribute("href") || "");
      const insecure = refs.filter((r) => /^http:\/\//i.test(r));
      return insecure.length
        ? { status: "warn", detail: `${insecure.length} resource(s) loaded over insecure http://.`, fix: "Update http:// resource links to https:// — browsers block mixed content and show a security warning.", law: "Security" }
        : { status: "pass", detail: "No insecure http:// resources detected." };
    }],
  ],
};

const CAT_META = {
  accessibility: { name: "♿ Accessibility (ADA / WCAG)", legal: true },
  privacy: { name: "🔒 Privacy & legal", legal: true },
  schema: { name: "🔎 Schema & SEO", legal: false },
  trust: { name: "🛡️ Trust signals", legal: false },
};
const WEIGHT = { pass: 1, info: null, warn: 0.5, fail: 0 };

function analyze(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ctx = { doc, html, url, u: new URL(url) };
  const cats = {};
  let legalFails = 0, a11yScore = 100, privacyScore = 100;
  for (const [key, list] of Object.entries(CHECKS)) {
    const results = list.map(([label, fn]) => {
      let r; try { r = fn(ctx); } catch { r = { status: "info", detail: "Could not evaluate." }; }
      return { label, ...r };
    });
    const scored = results.filter((r) => WEIGHT[r.status] !== null);
    const score = scored.length ? Math.round((scored.reduce((s, r) => s + WEIGHT[r.status], 0) / scored.length) * 100) : 100;
    cats[key] = { score, results };
    if (CAT_META[key].legal) legalFails += results.filter((r) => r.status === "fail").length;
    if (key === "accessibility") a11yScore = score;
    if (key === "privacy") privacyScore = score;
  }
  let risk = "low";
  if (legalFails >= 3 || a11yScore < 50 || privacyScore < 40) risk = "high";
  else if (legalFails >= 1 || a11yScore < 85) risk = "medium";
  const health = Math.round((cats.accessibility.score + cats.privacy.score + cats.schema.score + cats.trust.score) / 4);
  return { cats, risk, health, legalFails };
}

// --- rendering --------------------------------------------------------------
const STATUS_ORDER = { fail: 0, warn: 1, pass: 2, info: 3 };
const ICON = { pass: "✓", warn: "!", fail: "✕", info: "i" };
const gaugeColor = (s) => (s >= 80 ? "var(--pass)" : s >= 55 ? "var(--warn)" : "var(--fail)");

function render(report, url) {
  const r = report;
  const riskClass = { high: "risk-high", medium: "risk-med", low: "risk-low" }[r.risk];
  const riskWord = { high: "High risk", medium: "Some risk", low: "Low risk" }[r.risk];
  const verdict = {
    high: "Your site is showing several of the exact gaps that trigger ADA demand letters and privacy complaints. Worth fixing before it gets found.",
    medium: "A few issues that are worth cleaning up — fixable in an afternoon, and they reduce real legal and SEO risk.",
    low: "Looking solid. No major demand-letter red flags in your page source. Skim the items below for polish.",
  }[r.risk];

  const cat = (key) => {
    const c = r.cats[key];
    const rows = [...c.results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]).map((x) => `
      <div class="check">
        <span class="ic ${x.status === "info" ? "warn" : x.status}" aria-hidden="true" style="${x.status === "info" ? "background:#8b94a3" : ""}">${ICON[x.status]}</span>
        <div class="body">
          <div class="lbl">${esc(x.label)}</div>
          <p class="det">${esc(x.detail || "")}</p>
          ${x.fix ? `<p class="fix">${esc(x.fix)}</p>` : ""}
          ${x.law ? `<span class="law">${esc(x.law)}</span>` : ""}
        </div>
      </div>`).join("");
    return `<div class="cat">
      <div class="cat-head"><h3>${CAT_META[key].name}</h3>
        <span class="cat-score" style="color:${gaugeColor(c.score)}">${c.score}</span>
        <span class="bar"><i style="width:${c.score}%;background:${gaugeColor(c.score)}"></i></span>
      </div>${rows}</div>`;
  };

  const el = $("#results");
  el.innerHTML = `
    <div class="scorehead">
      <div class="gauge" style="background:conic-gradient(${gaugeColor(r.health)} ${r.health * 3.6}deg, var(--line) 0)">
        <div style="width:92px;height:92px;border-radius:50%;background:#fff;display:grid;place-items:center">
          <div><span style="color:${gaugeColor(r.health)}">${r.health}</span><small>HEALTH</small></div>
        </div>
      </div>
      <div class="verdict">
        <span class="risk-pill ${riskClass}">${riskWord}</span>
        <h2>Demand-letter risk: ${riskWord.toLowerCase()}</h2>
        <p>${verdict}</p>
        <p class="scanned">${esc(url)}</p>
      </div>
    </div>
    ${cat("accessibility")}${cat("privacy")}${cat("schema")}${cat("trust")}
    <div class="actions">
      <button class="primary" id="copy-report">📋 Copy report</button>
      <button id="again">↺ Scan another site</button>
      <a class="btn" href="https://copperbaytech.com" target="_blank" rel="noopener" style="padding:11px 18px;border:1.5px solid var(--line);border-radius:10px;font-weight:700">Get it fixed by Copper Bay Tech →</a>
    </div>
    <p class="micro">ShipSafe analyzes your page's HTML source and gives heuristic guidance, not legal advice. A deeper rendered-page scan is coming in Pro.</p>`;

  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#again").onclick = () => { el.hidden = true; $("#url").value = ""; $("#url").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("#copy-report").onclick = () => {
    const text = reportText(r, url);
    navigator.clipboard.writeText(text).then(() => { $("#copy-report").textContent = "✓ Copied!"; setTimeout(() => ($("#copy-report").textContent = "📋 Copy report"), 1800); });
  };
}

function reportText(r, url) {
  let out = `ShipSafe report — ${url}\nHealth ${r.health}/100 · Demand-letter risk: ${r.risk.toUpperCase()}\n`;
  for (const [key, meta] of Object.entries(CAT_META)) {
    out += `\n${meta.name} — ${r.cats[key].score}/100\n`;
    for (const x of [...r.cats[key].results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])) {
      out += `  [${x.status.toUpperCase()}] ${x.label} — ${x.detail || ""}\n`;
    }
  }
  out += `\nChecked free at https://dukotah.github.io/shipsafe/ (heuristic, not legal advice).`;
  return out;
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// --- wire up ----------------------------------------------------------------
$("#scan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = normalizeUrl($("#url").value);
  const status = $("#status");
  const btn = $("#scan-btn");
  $("#results").hidden = true;
  if (!u) { status.textContent = "Hmm, that doesn't look like a URL. Try again (e.g. example.com)."; return; }
  btn.disabled = true; btn.textContent = "Checking…";
  status.textContent = `Fetching ${u.host} and analyzing…`;
  try {
    const html = await fetchHTML(u.href);
    const report = analyze(html, u.href);
    render(report, u.href);
    status.textContent = "Free · client-side · we don't store your URL.";
  } catch {
    $("#results").innerHTML = `<div class="msg"><strong>Couldn't read that site.</strong> It may block third-party fetching, or it renders entirely with JavaScript (so the HTML source is nearly empty). The free in-browser check can only read static source — the upcoming Pro scan renders the full page. Try another URL in the meantime.</div>`;
    $("#results").hidden = false;
    status.textContent = "Free · client-side · we don't store your URL.";
  } finally {
    btn.disabled = false; btn.textContent = "Check my site";
  }
});
