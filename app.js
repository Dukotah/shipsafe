/* ShipSafe — client-side accessibility + privacy + schema risk checker.
   Fetches the target page via a CORS-proxy fallback chain and analyzes the source HTML. */

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];
const $ = (s) => document.querySelector(s);

// --- inline icon set (no emoji) ---------------------------------------------
const ICON = {
  accessibility: '<path d="M12 4a2 2 0 1 0 0-.001M5 8c2 .8 4.5 1 7 1s5-.2 7-1M9 21l3-7 3 7M12 9v5" />',
  privacy: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  schema: '<path d="M9 8 5 12l4 4M15 8l4 4-4 4M13 5l-2 14"/>',
  trust: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
  pass: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.2 2.2 4.8-5" stroke="#fff" fill="none"/>',
  warn: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17.2v.2" stroke="#fff" fill="none"/>',
  fail: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6" stroke="#fff" fill="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8.2v.2" stroke="#fff" fill="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  again: '<path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7M4 12h5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
};
const svg = (name, cls, opt = {}) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="${opt.fill || "none"}" stroke="${opt.stroke || "currentColor"}" stroke-width="${opt.sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;
const statSvg = (status) => {
  const color = { pass: "var(--pass)", warn: "var(--warn)", fail: "var(--fail)", info: "var(--muted-2)" }[status];
  return `<svg class="stat" viewBox="0 0 24 24" fill="${color}" aria-hidden="true" focusable="false"><title>${status}</title>${ICON[status]}</svg>`;
};

const WCAG_URL = {
  "3.1.1": "language-of-page", "3.1.2": "language-of-parts",
  "1.1.1": "non-text-content", "1.3.1": "info-and-relationships",
  "4.1.1": "parsing", "4.1.2": "name-role-value", "2.4.2": "page-titled", "2.4.3": "focus-order", "2.4.4": "link-purpose-in-context", "1.4.10": "reflow",
  "1.2.2": "captions-prerecorded",
  "2.4.1": "bypass-blocks",
};
function lawTag(law) {
  if (!law) return "";
  const m = law.match(/(\d+\.\d+\.\d+)/);
  if (m && WCAG_URL[m[1]]) return `<a class="law" href="https://www.w3.org/WAI/WCAG22/Understanding/${WCAG_URL[m[1]]}.html" target="_blank" rel="noopener">${esc(law)} ↗</a>`;
  return `<span class="law">${esc(law)}</span>`;
}

function normalizeUrl(raw) {
  let s = (raw || "").trim().replace(/^https?:\/\//i, "");
  if (!s) return null;
  try { return new URL("https://" + s); } catch { return null; }
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
    } catch { /* next */ }
  }
  throw new Error("fetch-failed");
}
function accName(el) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (t) return t;
  for (const a of ["aria-label", "title"]) if (el.getAttribute(a)?.trim()) return el.getAttribute(a).trim();
  if (el.getAttribute("aria-labelledby")?.trim()) return "(labelledby)";
  const img = el.querySelector("img[alt]");
  if (img && img.getAttribute("alt").trim()) return img.getAttribute("alt").trim();
  if (el.querySelector("svg [aria-label], svg title")) return "(svg label)";
  return "";
}

const CHECKS = {
  accessibility: [
    ["Page language declared", (c) => {
      const lang = c.doc.documentElement.getAttribute("lang");
      return lang && lang.trim() ? { status: "pass", detail: `lang="${lang}"` }
        : { status: "fail", detail: "The <html> tag has no lang attribute.", fix: 'Add a language to your <html> tag — e.g. <html lang="en">. Screen readers need it to pronounce your page correctly.', law: "WCAG 3.1.1" };
    }],
    ["Images have alt text", (c) => {
      const imgs = [...c.doc.querySelectorAll("img")];
      if (!imgs.length) return { status: "info", detail: "No <img> elements found in the source." };
      const missing = imgs.filter((i) => !i.hasAttribute("alt"));
      return missing.length ? { status: "fail", detail: `${missing.length} of ${imgs.length} images have no alt attribute.`, fix: 'Add alt="" to decorative images and a short description to meaningful ones. Missing alt text is the single most-cited issue in ADA complaints.', law: "WCAG 1.1.1" }
        : { status: "pass", detail: `All ${imgs.length} images carry an alt attribute.` };
    }],
    ["Form fields are labeled", (c) => {
      const fields = [...c.doc.querySelectorAll("input,select,textarea")].filter((el) => !["hidden", "submit", "button", "image", "reset"].includes((el.getAttribute("type") || "").toLowerCase()));
      if (!fields.length) return { status: "info", detail: "No form fields found in the source." };
      const bad = fields.filter((el) => {
        if (["aria-label", "aria-labelledby", "title"].some((a) => el.getAttribute(a)?.trim())) return false;
        if (el.id && c.doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        return !el.closest("label");
      });
      return bad.length ? { status: "fail", detail: `${bad.length} of ${fields.length} form fields have no associated label.`, fix: "Give every input a <label for> (or aria-label). A placeholder is not a label — it disappears on focus and screen readers may skip it.", law: "WCAG 1.3.1 / 4.1.2" }
        : { status: "pass", detail: `All ${fields.length} form fields are labeled.` };
    }],
    ["Links & buttons have names", (c) => {
      const controls = [...c.doc.querySelectorAll("a[href],button")];
      if (!controls.length) return { status: "info", detail: "No links or buttons found." };
      const empty = controls.filter((el) => !accName(el));
      return empty.length ? { status: "fail", detail: `${empty.length} of ${controls.length} links/buttons have no readable text or label (often icon-only buttons).`, fix: "Give icon-only controls an aria-label and make link text descriptive. A control a screen reader can't announce is unusable.", law: "WCAG 4.1.2" }
        : { status: "pass", detail: `All ${controls.length} links/buttons have an accessible name.` };
    }],
    ["Page has a title", (c) => {
      const t = (c.doc.title || "").trim();
      return t ? { status: "pass", detail: `"${t.slice(0, 72)}"` } : { status: "fail", detail: "The page has no <title>.", fix: "Add a descriptive <title> — it's the first thing a screen reader announces and your search-result headline.", law: "WCAG 2.4.2" };
    }],
    ["Heading structure", (c) => {
      const h1 = c.doc.querySelectorAll("h1").length;
      if (h1 === 0) return { status: "warn", detail: "No <h1> found.", fix: "Add exactly one <h1> describing the page; use <h2>/<h3> for sections. Headings are how screen-reader users navigate.", law: "WCAG 1.3.1" };
      if (h1 > 1) return { status: "warn", detail: `${h1} <h1> elements — there should be one.`, fix: "Use a single <h1>, then <h2>/<h3> beneath it.", law: "WCAG 1.3.1" };
      return { status: "pass", detail: "Exactly one <h1>." };
    }],
    ["Mobile viewport", (c) => c.doc.querySelector('meta[name="viewport"]') ? { status: "pass", detail: "Responsive viewport meta present." }
      : { status: "warn", detail: "No viewport meta tag.", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so the page is usable and zoomable on phones.', law: "WCAG 1.4.10" }],
    ["Main landmark", (c) => c.doc.querySelector('main,[role="main"]') ? { status: "pass", detail: "<main> landmark present." }
      : { status: "warn", detail: "No <main> landmark.", fix: "Wrap your primary content in <main> so assistive tech can jump straight to it.", law: "WCAG 1.3.1" }],
    ["Descriptive link text", (c) => {
      const links = [...c.doc.querySelectorAll("a[href]")].filter(a => {
        const href = (a.getAttribute("href") || "").trim();
        return href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:");
      });
      if (!links.length) return { status: "info", detail: "No navigation links found." };
      const generic = new Set(["click here", "here", "read more", "more", "learn more", "continue", "details", "click", "link", "more info"]);
      const bad = links.filter(a => {
        if (a.getAttribute("aria-label")?.trim() || a.getAttribute("aria-labelledby")?.trim()) return false;
        return generic.has((a.textContent || "").replace(/\s+/g, " ").trim().toLowerCase());
      });
      return bad.length
        ? { status: "warn", detail: `${bad.length} link(s) use generic text ("click here", "here", "read more"…) that won't tell screen-reader users where the link goes.`, fix: 'Describe where each link leads: "Read our privacy policy" instead of "click here". Screen-reader users navigate by jumping between links, so the text must work out of context.', law: "WCAG 2.4.4" }
        : { status: "pass", detail: "No obviously generic link text found." };
    }],
    ["ARIA roles are valid", (c) => {
      const elements = [...c.doc.querySelectorAll("[role]")];
      if (!elements.length) return { status: "info", detail: "No elements with role attributes found." };
      const VALID_ROLES = new Set([
        "alert","alertdialog","application","article","banner","button","cell","checkbox",
        "columnheader","combobox","complementary","contentinfo","definition","dialog",
        "directory","document","feed","figure","form","generic","grid","gridcell","group",
        "heading","img","link","list","listbox","listitem","log","main","marquee","math",
        "menu","menubar","menuitem","menuitemcheckbox","menuitemradio","meter","navigation",
        "none","note","paragraph","presentation","progressbar","radio","radiogroup",
        "region","row","rowgroup","rowheader","scrollbar","search","searchbox","separator",
        "slider","spinbutton","status","switch","tab","table","tablist","tabpanel","term",
        "textbox","timer","toolbar","tooltip","tree","treegrid","treeitem",
        "caption","code","deletion","emphasis","insertion","mark","strong","subscript","superscript","time"
      ]);
      const bad = elements.filter(el => {
        const roles = (el.getAttribute("role") || "").trim().split(/\s+/).filter(Boolean);
        if (!roles.length) return true;
        return roles.some(r => !VALID_ROLES.has(r));
      });
      if (!bad.length) return { status: "pass", detail: `All ${elements.length} role attribute(s) use recognized ARIA values.` };
      const emptyCount = bad.filter(el => !(el.getAttribute("role") || "").trim()).length;
      const detail = emptyCount === bad.length
        ? `${bad.length} element(s) have an empty role="" that gives assistive technology nothing to announce.`
        : `${bad.length} element(s) carry an unrecognized or empty ARIA role value.`;
      return { status: "fail", detail, fix: 'Remove empty role="" attributes and replace unrecognized values with a valid WAI-ARIA role (e.g. role="button", role="dialog"), or remove the attribute entirely. Screen readers announce role values — an invalid role confuses or misleads assistive technology.', law: "WCAG 4.1.2" };
    }],
    ["Tab order preserved", (c) => {
      const elements = [...c.doc.querySelectorAll("[tabindex]")];
      if (!elements.length) return { status: "info", detail: "No elements with tabindex attributes found." };
      const abusers = elements.filter(el => {
        const val = parseInt(el.getAttribute("tabindex"), 10);
        return !isNaN(val) && val > 0;
      });
      if (!abusers.length) return { status: "pass", detail: `${elements.length} tabindex attribute(s) found — none override the natural DOM order.` };
      return { status: "warn", detail: `${abusers.length} element(s) use a positive tabindex value, which overrides the natural DOM tab order and can create a disjointed keyboard navigation experience.`, fix: 'Replace tabindex="1", tabindex="2", etc. with tabindex="0" or remove the attribute entirely. Use DOM source order to control focus flow instead. Positive tabindex values cause focus to jump to those elements before all tabindex="0" and naturally focusable elements on the page, which almost always breaks the expected reading order for keyboard and screen-reader users.', law: "WCAG 2.4.3" };
    }],
    ["Video captions", (c) => {
      const videos = [...c.doc.querySelectorAll("video")];
      if (!videos.length) return { status: "info", detail: "No <video> elements found in the source." };
      const missing = videos.filter(v => {
        const tracks = [...v.querySelectorAll("track")];
        return !tracks.some(t => {
          const kind = (t.getAttribute("kind") || "").toLowerCase();
          return kind === "captions" || kind === "subtitles";
        });
      });
      if (!missing.length) return { status: "pass", detail: `All ${videos.length} video element(s) have a captions or subtitles track.` };
      return { status: "fail", detail: `${missing.length} of ${videos.length} <video> element(s) have no <track kind="captions"> or <track kind="subtitles">.`, fix: 'Add a <track kind="captions" src="captions.vtt" srclang="en" label="English"> inside each <video> element. WCAG 1.2.2 requires captions for all prerecorded audio content — missing captions are one of the most common ADA lawsuit triggers for media-heavy sites.', law: "WCAG 1.2.2" };
    }],
    ["Language of parts", (c) => {
      const elements = [...c.doc.querySelectorAll("[lang]")].filter(el => el.tagName.toLowerCase() !== "html");
      if (!elements.length) return { status: "info", detail: "No inline lang attributes found. If your page includes foreign-language phrases, mark them with a lang attribute so screen readers can pronounce them correctly." };
      const BCP47 = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/;
      const bad = elements.filter(el => {
        const val = (el.getAttribute("lang") || "").trim();
        return !val || !BCP47.test(val);
      });
      if (!bad.length) return { status: "pass", detail: `${elements.length} inline lang attribute(s) found — all use a well-formed language tag.` };
      const emptyCount = bad.filter(el => !(el.getAttribute("lang") || "").trim()).length;
      const detail = emptyCount === bad.length
        ? `${bad.length} element(s) carry an empty lang="" that gives screen readers no language context.`
        : `${bad.length} element(s) have an empty or structurally invalid lang value.`;
      return { status: "fail", detail, fix: 'Remove empty lang="" attributes and replace invalid values with a valid BCP 47 language subtag — e.g. lang="fr" for French, lang="es" for Spanish, lang="zh-TW" for Traditional Chinese. Screen readers switch pronunciation engines at lang boundaries; an empty or unrecognized value corrupts pronunciation for the affected content.', law: "WCAG 3.1.2" };
    }],
    ["Skip link resolves", (c) => {
      const byClass = [...c.doc.querySelectorAll('a.skip, a[class*="skip-link"]')];
      const byText  = [...c.doc.querySelectorAll('a[href^="#"]')].filter(
        a => /\bskip\b/i.test((a.textContent || "").trim())
      );
      const seen = new Set();
      const skipLinks = [...byClass, ...byText].filter(a => {
        if (seen.has(a)) return false;
        seen.add(a);
        return true;
      });
      if (!skipLinks.length) return { status: "info", detail: "No skip navigation link detected. A skip link is strongly recommended for keyboard users to bypass repeated navigation blocks." };
      const broken = skipLinks.filter(a => {
        const href = (a.getAttribute("href") || "").trim();
        if (!href.startsWith("#")) return false;
        const id = href.slice(1);
        return !id || !c.doc.getElementById(id);
      });
      if (!broken.length) {
        const targets = skipLinks.map(a => a.getAttribute("href")).join(", ");
        return { status: "pass", detail: `Skip link found — destination exists in the page (${targets}).` };
      }
      const targets = broken.map(a => a.getAttribute("href")).join(", ");
      return {
        status: "fail",
        detail: `${broken.length} skip link(s) point to a destination that does not exist in the page source (${targets}).`,
        fix: 'The href in your skip link must match an id on a real element in the same page. For example, <a class="skip" href="#main"> requires an element with id="main". A skip link that leads nowhere means keyboard and screen-reader users who activate it land in an undefined location, defeating its only purpose.',
        law: "WCAG 2.4.1"
      };
    }],
    ["Duplicate IDs", (c) => {
      const ids = [...c.doc.querySelectorAll("[id]")].map(el => el.id).filter(Boolean);
      if (!ids.length) return { status: "info", detail: "No id attributes found on this page." };
      const counts = {};
      for (const id of ids) counts[id] = (counts[id] || 0) + 1;
      const dupes = Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => `"${id}" (×${n})`);
      if (!dupes.length) return { status: "pass", detail: `${ids.length} unique ID attribute${ids.length === 1 ? "" : "s"} — all values are distinct.` };
      return {
        status: "fail",
        detail: `${dupes.length} duplicate ID value${dupes.length === 1 ? "" : "s"}: ${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? ` and ${dupes.length - 5} more` : ""}.`,
        fix: 'Each id attribute value must be unique within a page. Duplicate IDs silently break for/aria-labelledby/aria-describedby associations — assistive technology reads the first matching element and ignores the rest. Use classes for styling hooks and reserve IDs for unique landmarks, form labels, and fragment anchors.',
        law: "WCAG 4.1.1"
      };
    }],
    ["ARIA required attributes", (c) => {
      const REQUIRED = {
        checkbox:         ["aria-checked"],
        combobox:         ["aria-expanded"],
        heading:          ["aria-level"],
        menuitemcheckbox: ["aria-checked"],
        menuitemradio:    ["aria-checked"],
        meter:            ["aria-valuenow"],
        option:           ["aria-selected"],
        radio:            ["aria-checked"],
        scrollbar:        ["aria-controls", "aria-valuenow", "aria-valuemin", "aria-valuemax"],
        slider:           ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
        spinbutton:       ["aria-valuenow"],
        switch:           ["aria-checked"],
      };
      const candidates = [...c.doc.querySelectorAll("[role]")].filter(el => {
        const roles = (el.getAttribute("role") || "").trim().split(/\s+/).filter(Boolean);
        return roles.some(r => REQUIRED[r]);
      });
      if (!candidates.length) return { status: "info", detail: "No elements found with ARIA roles that have mandatory state/property attributes." };
      const violations = [];
      for (const el of candidates) {
        const roles = (el.getAttribute("role") || "").trim().split(/\s+/).filter(Boolean);
        for (const role of roles) {
          if (!REQUIRED[role]) continue;
          const missing = REQUIRED[role].filter(attr => !el.hasAttribute(attr));
          if (missing.length) violations.push(`role="${role}" missing ${missing.join(", ")}`);
        }
      }
      if (!violations.length) return { status: "pass", detail: `All ${candidates.length} element(s) with required-attribute roles carry their mandatory ARIA state/property attributes.` };
      const shown = violations.slice(0, 3).join("; ");
      const more = violations.length > 3 ? ` and ${violations.length - 3} more` : "";
      return {
        status: "fail",
        detail: `${violations.length} element(s) are missing required ARIA attributes: ${shown}${more}.`,
        fix: "Each WAI-ARIA role with required state/properties must carry those attributes. For example: role=\"slider\" requires aria-valuenow, aria-valuemin, and aria-valuemax; role=\"checkbox\" and role=\"switch\" require aria-checked; role=\"combobox\" requires aria-expanded. Missing required attributes mean assistive technology cannot correctly announce or interact with the control.",
        law: "WCAG 4.1.2",
      };
    }],
  ],
  privacy: [
    ["Privacy policy linked", (c) => hasLink(c, /privacy/i) ? { status: "pass", detail: "A privacy-policy link was found." }
      : { status: "fail", detail: "No privacy-policy link found.", fix: "Publish a privacy policy and link it in your footer. Required under CCPA/GDPR if you collect any data — and often bundled into accessibility complaints.", law: "CCPA / GDPR" }],
    ["Cookie / consent notice", (c) => {
      const h = c.html.toLowerCase();
      const cmp = /cookiebot|onetrust|osano|termly|cookieyes|iubenda|usercentrics|klaro|cookie-?consent/.test(h);
      const trackers = /googletagmanager|gtag\(|google-analytics|fbevents|fbq\(|hotjar|clarity\.ms|mixpanel|segment\.com/.test(h);
      const banner = /cookie/.test(h) && /(accept|consent|agree|preferences|reject)/.test(h);
      if (cmp || banner) return { status: "pass", detail: "A cookie/consent mechanism appears to be present." };
      if (trackers) return { status: "fail", detail: "Tracking scripts were found but no cookie-consent notice.", fix: "You're loading trackers (GA, Meta Pixel, etc.) without a consent banner — a direct GDPR/CCPA exposure. Add a consent notice or remove the trackers.", law: "GDPR / ePrivacy" };
      return { status: "info", detail: "No obvious trackers and no consent banner — usually fine for a static site." };
    }],
    ["Terms of service linked", (c) => hasLink(c, /terms|conditions/i) ? { status: "pass", detail: "A terms/conditions link was found." }
      : { status: "warn", detail: "No terms-of-service link found.", fix: "Add a Terms of Service link, especially if users can sign up, buy, or submit content." }],
    ["Contact path", (c) => ([...c.doc.querySelectorAll("a")].some((a) => /^mailto:/i.test(a.getAttribute("href") || "")) || hasLink(c, /contact/i)) ? { status: "pass", detail: "A contact link or email was found." }
      : { status: "warn", detail: "No contact link or email found.", fix: "Give visitors a clear way to reach you. Its absence is a trust and sometimes a legal red flag." }],
    ["Accessibility statement", (c) => hasLink(c, /accessib/i) ? { status: "pass", detail: "An accessibility statement link was found." }
      : { status: "warn", detail: "No accessibility statement.", fix: "Publish an accessibility statement with a contact for issues. It signals good-faith effort and is shown to reduce demand-letter risk." }],
  ],
  schema: [
    ["Structured data (schema.org)", (c) => {
      const blocks = [...c.doc.querySelectorAll('script[type="application/ld+json"]')];
      if (!blocks.length) return { status: "warn", detail: "No JSON-LD structured data found.", fix: "Add schema.org JSON-LD (Organization, WebSite, Product…) so Google can show rich results.", law: "SEO" };
      const broken = blocks.filter((b) => { try { JSON.parse(b.textContent); return false; } catch { return true; } });
      return broken.length ? { status: "fail", detail: `${broken.length} of ${blocks.length} JSON-LD blocks contain invalid JSON.`, fix: "A broken JSON-LD block is silently ignored by Google — validate it (usually a stray comma or unescaped quote).", law: "SEO" }
        : { status: "pass", detail: `${blocks.length} valid JSON-LD block(s).` };
    }],
    ["Meta description", (c) => {
      const v = c.doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();
      return v ? { status: "pass", detail: `${v.length} characters.` } : { status: "warn", detail: "No meta description.", fix: "Add a 120–160 character meta description — it's your search-result pitch.", law: "SEO" };
    }],
    ["Open Graph tags", (c) => {
      const ogt = c.doc.querySelector('meta[property="og:title"]'), ogi = c.doc.querySelector('meta[property="og:image"]');
      return ogt && ogi ? { status: "pass", detail: "og:title and og:image present." }
        : { status: "warn", detail: `Missing ${[!ogt && "og:title", !ogi && "og:image"].filter(Boolean).join(" + ")}.`, fix: "Add Open Graph tags so shared links show a title and preview image instead of a blank box.", law: "SEO" };
    }],
    ["Canonical URL", (c) => c.doc.querySelector('link[rel="canonical"]') ? { status: "pass", detail: "Canonical link present." } : { status: "info", detail: "No canonical link (fine for a single-page site)." }],
  ],
  trust: [
    ["HTTPS", (c) => c.u.protocol === "https:" ? { status: "pass", detail: "Served over HTTPS." } : { status: "fail", detail: "Site is not using HTTPS.", fix: "Serve over HTTPS — browsers flag HTTP sites as 'Not secure', which tanks trust and SEO.", law: "Security" }],
    ["Favicon", (c) => c.doc.querySelector('link[rel~="icon"],link[rel="shortcut icon"]') ? { status: "pass", detail: "Favicon declared." } : { status: "info", detail: "No favicon — minor, but it makes tabs and bookmarks look unfinished." }],
    ["No mixed content", (c) => {
      if (c.u.protocol !== "https:") return { status: "info", detail: "N/A (site is not HTTPS)." };
      const insecure = [...c.doc.querySelectorAll("[src],[href]")].map((e) => e.getAttribute("src") || e.getAttribute("href") || "").filter((r) => /^http:\/\//i.test(r));
      return insecure.length ? { status: "warn", detail: `${insecure.length} resource(s) loaded over insecure http://.`, fix: "Update http:// resource links to https:// — browsers block mixed content and warn users.", law: "Security" } : { status: "pass", detail: "No insecure http:// resources detected." };
    }],
  ],
};
const hasLink = (c, re) => [...c.doc.querySelectorAll("a")].some((a) => re.test(a.textContent) || re.test(a.getAttribute("href") || ""));

const CAT_META = {
  accessibility: { name: "Accessibility (ADA / WCAG)", icon: "accessibility", legal: true, blurb: "Page language, alt text, form labels, accessible names, headings — the issues cited in ADA complaints.", weight: "Highest weight" },
  privacy: { name: "Privacy & legal", icon: "privacy", legal: true, blurb: "Privacy policy, cookie consent, terms, contact path — frequently bundled into the same complaints.", weight: "High weight" },
  schema: { name: "Schema & SEO", icon: "schema", legal: false, blurb: "Structured data, meta description, Open Graph, canonical — quietly costs you search visibility.", weight: "Visibility" },
  trust: { name: "Trust signals", icon: "trust", legal: false, blurb: "HTTPS, favicon, mobile viewport, mixed content — the basics that make a site look legitimate.", weight: "Polish" },
};
const WEIGHT = { pass: 1, info: null, warn: 0.5, fail: 0 };

function analyze(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ctx = { doc, html, url, u: new URL(url) };
  const cats = {}; let legalFails = 0, a11y = 100, priv = 100;
  for (const [key, list] of Object.entries(CHECKS)) {
    const results = list.map(([label, fn]) => { let r; try { r = fn(ctx); } catch { r = { status: "info", detail: "Could not evaluate." }; } return { label, ...r }; });
    const scored = results.filter((r) => WEIGHT[r.status] !== null);
    const score = scored.length ? Math.round((scored.reduce((s, r) => s + WEIGHT[r.status], 0) / scored.length) * 100) : 100;
    cats[key] = { score, results };
    if (CAT_META[key].legal) legalFails += results.filter((r) => r.status === "fail").length;
    if (key === "accessibility") a11y = score; if (key === "privacy") priv = score;
  }
  let risk = "low";
  if (legalFails >= 3 || a11y < 50 || priv < 40) risk = "high";
  else if (legalFails >= 1 || a11y < 85) risk = "medium";
  const health = Math.round((cats.accessibility.score + cats.privacy.score + cats.schema.score + cats.trust.score) / 4);
  return { cats, risk, health, grade: gradeOf(health) };
}
function gradeOf(h) { return h >= 90 ? "A" : h >= 80 ? "B" : h >= 70 ? "C" : h >= 55 ? "D" : "F"; }
const tone = (s) => (s >= 80 ? "var(--pass)" : s >= 55 ? "var(--warn)" : "var(--fail)");
const STATUS_ORDER = { fail: 0, warn: 1, pass: 2, info: 3 };

function render(r, url) {
  const riskClass = { high: "risk-high", medium: "risk-med", low: "risk-low" }[r.risk];
  const riskWord = { high: "High risk", medium: "Some risk", low: "Low risk" }[r.risk];
  const riskIcon = { high: "fail", medium: "warn", low: "pass" }[r.risk];
  const verdict = {
    high: "Your page shows several of the exact gaps that trigger ADA demand letters and privacy complaints. Worth fixing before a filer finds it.",
    medium: "A handful of issues worth cleaning up — most are an afternoon of work and they cut real legal and SEO risk.",
    low: "Solid. No major demand-letter red flags in your page source. Skim the items below for polish.",
  }[r.risk];

  const cat = (key) => {
    const c = r.cats[key], m = CAT_META[key];
    const rows = [...c.results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]).map((x) => `
      <div class="check">${statSvg(x.status)}<div class="body">
        <div class="lbl">${esc(x.label)}</div><p class="det">${esc(x.detail || "")}</p>
        ${x.fix ? `<p class="fix">${esc(x.fix)}</p>` : ""}${x.status !== "pass" && x.status !== "info" ? lawTag(x.law) : ""}
      </div></div>`).join("");
    return `<div class="cat"><div class="cat-head">${svg(m.icon, "ico")}<h3>${esc(m.name)}</h3>
      <span class="cat-score" style="color:${tone(c.score)}">${c.score}</span>
      <span class="bar"><i style="width:${c.score}%;background:${tone(c.score)}"></i></span></div>${rows}</div>`;
  };

  const el = $("#results");
  el.innerHTML = `
    <div class="report-head">
      <div class="grade" style="background:${tone(r.health)}">${r.grade}<small>GRADE</small></div>
      <div class="verdict">
        <span class="risk-pill ${riskClass}">${svg(riskIcon, "", { fill: "currentColor", stroke: "none" })}${riskWord}</span>
        <h2>Health ${r.health}/100 — ${riskWord.toLowerCase()}</h2>
        <p>${verdict}</p>
        <p class="scanned">${esc(url)}</p>
      </div>
    </div>
    ${cat("accessibility")}${cat("privacy")}${cat("schema")}${cat("trust")}
    <div class="actions">
      <button class="btn primary" id="copy-report">${svg("copy", "")}Copy report</button>
      <button class="btn" id="again">${svg("again", "")}Scan another</button>
      <a class="btn" href="https://copperbaytech.com" target="_blank" rel="noopener">Get it fixed by Copper Bay Tech →</a>
    </div>
    <p class="trustline" style="margin-top:8px">ShipSafe analyzes your page's HTML source and gives heuristic guidance, not legal advice. <a href="methodology.html">How we score →</a></p>`;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(() => {
    const h2 = el.querySelector("h2");
    if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); }
  });
  $("#again").onclick = () => { el.hidden = true; $("#url").value = ""; $("#url").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("#copy-report").onclick = () => navigator.clipboard.writeText(reportText(r, url)).then(() => { const b = $("#copy-report"); b.innerHTML = svg("pass", "", { fill: "currentColor", stroke: "none" }) + "Copied"; setTimeout(() => (b.innerHTML = svg("copy", "") + "Copy report"), 1800); });
}

function reportText(r, url) {
  let o = `ShipSafe report — ${url}\nGrade ${r.grade} · Health ${r.health}/100 · Demand-letter risk: ${r.risk.toUpperCase()}\n`;
  for (const [k, m] of Object.entries(CAT_META)) {
    o += `\n${m.name} — ${r.cats[k].score}/100\n`;
    for (const x of [...r.cats[k].results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])) o += `  [${x.status.toUpperCase()}] ${x.label} — ${x.detail || ""}\n`;
  }
  return o + `\nChecked free at https://dukotah.github.io/shipsafe/ — heuristic, not legal advice.`;
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function skeleton() {
  const skRow = (w) => `<div class="sk" style="height:14px;width:${w}%;border-radius:7px"></div>`;
  const skCat = () => `
    <div class="cat skeleton" style="margin-bottom:16px">
      <div class="cat-head" style="border-bottom:1px solid var(--line-2)">
        <div class="sk" style="width:24px;height:24px;border-radius:6px;flex:0 0 24px"></div>
        <div class="sk" style="height:15px;width:45%;border-radius:7px;margin-left:4px"></div>
        <div class="sk" style="height:15px;width:60px;border-radius:7px;margin-left:auto"></div>
        <div class="sk" style="height:8px;width:110px;border-radius:6px"></div>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">
        ${skRow(55)} ${skRow(80)} ${skRow(68)} ${skRow(45)}
      </div>
    </div>`;
  $("#results").innerHTML = `
    <div class="report-head skeleton" style="margin-bottom:20px">
      <div class="grade sk" style="background:var(--line-2);box-shadow:none"></div>
      <div class="verdict" style="flex:1;display:flex;flex-direction:column;gap:11px">
        <div class="sk" style="height:18px;width:38%;border-radius:9px"></div>
        <div class="sk" style="height:26px;width:72%;border-radius:9px"></div>
        <div class="sk" style="height:15px;width:88%;border-radius:7px"></div>
        <div class="sk" style="height:15px;width:60%;border-radius:7px"></div>
      </div>
    </div>
    ${skCat()}${skCat()}`;
  $("#results").hidden = false;
}

// --- build the landing "what we look for" strip -----------------------------
function buildCatGrid() {
  const g = $("#cat-grid"); if (!g) return;
  g.innerHTML = Object.values(CAT_META).map((m) => `<div class="feature" role="listitem">${svg(m.icon, "ico")}<h3>${esc(m.name)}</h3><p>${esc(m.blurb)}</p><span class="tag">${esc(m.weight)}</span></div>`).join("");
}

function setBtnLoading(btn, loading) {
  const label = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".btn-spinner");
  if (loading) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Checking…";
    if (spinner) spinner.hidden = false;
  } else {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    if (label) label.textContent = "Check my site";
    if (spinner) spinner.hidden = true;
  }
}

$("#scan-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = normalizeUrl($("#url").value), status = $("#scan-status"), btn = $("#scan-btn");
  $("#results").hidden = true;
  if (!u) { status.textContent = "That doesn't look like a URL — try again (e.g. example.com)."; return; }
  setBtnLoading(btn, true);
  status.textContent = `Fetching ${u.host} and running checks…`;
  skeleton();
  try {
    const report = analyze(await fetchHTML(u.href), u.href);
    render(report, u.href);
    status.textContent = "Free — runs in your browser — we never store your URL.";
    // Reflect the scanned site in the URL so the result is shareable / re-runnable.
    const slug = u.host + (u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "");
    history.replaceState(null, "", "?url=" + encodeURIComponent(slug));
  } catch {
    $("#results").innerHTML = `<div class="notice" role="alert"><strong>Couldn't read that site.</strong> It may block third-party fetching, or it renders entirely with JavaScript (so the HTML source is nearly empty). The free in-browser check reads static source only — the upcoming rendered scan handles both. Try another URL in the meantime.</div>`;
    $("#results").hidden = false;
    const noticeEl = $("#results").querySelector(".notice");
    if (noticeEl) { noticeEl.tabIndex = -1; noticeEl.focus({ preventScroll: true }); }
    status.textContent = "Free — runs in your browser — we never store your URL.";
  } finally {
    setBtnLoading(btn, false);
  }
});

buildCatGrid();

const _params = new URLSearchParams(location.search);

// ?demo=1 — render a representative sample report (real engine, crafted sample). A "see a sample" link.
if (_params.get("demo") === "1") {
  const sample = '<!doctype html><html><head><title>Maple Street Bakery</title>' +
    '<meta name="description" content="Fresh sourdough and pastries in downtown Petaluma."><link rel="icon" href="/favicon.ico">' +
    '<script src="https://www.googletagmanager.com/gtag/js"><' + '/script></head><body><main>' +
    '<h1>Maple Street Bakery</h1><img src="hero.jpg"><img src="logo.png" alt="Maple Street Bakery">' +
    '<form><input type="email" placeholder="Email"><button>Join</button></form>' +
    '<a href="mailto:hi@bakery.example">Email us</a> <a href="/menu">Menu</a></main></body></html>';
  render(analyze(sample, "https://maple-street-bakery.example"), "https://maple-street-bakery.example (sample)");
}

// Deep link: ?url=example.com prefills + auto-runs a scan (shareable result links).
const _deep = _params.get("url");
if (_deep) {
  const inp = $("#url");
  if (inp) { inp.value = _deep.replace(/^https?:\/\//, ""); $("#scan-form")?.requestSubmit(); }
}

// Sync aria-expanded on FAQ <details> for AT (VoiceOver + Safari compatibility).
document.querySelectorAll(".faq details").forEach(d => {
  const s = d.querySelector("summary");
  if (!s) return;
  s.setAttribute("aria-expanded", d.open ? "true" : "false");
  d.addEventListener("toggle", () => s.setAttribute("aria-expanded", d.open ? "true" : "false"));
});
