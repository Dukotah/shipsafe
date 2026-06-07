# ShipSafe 🛟

**Is your website about to get an ADA demand letter?** Paste a URL → a plain-English report on the
accessibility (ADA/WCAG), privacy, and schema gaps that actually get sites sued. Built for the wave
of AI-generated & no-code sites. Free, no signup.

**Live:** https://dukotah.github.io/shipsafe/

A static, client-side web app: it fetches the target page via a CORS-proxy fallback chain and runs a
battery of source-HTML checks (page language, alt text, form labels, accessible names, headings,
privacy-policy/cookie/terms/contact links, JSON-LD validity, Open Graph, HTTPS, mixed content, …),
then frames the results as plain-English **demand-letter risk** with a prioritized fix list.

Heuristic guidance, **not legal advice**. The free check reads static source; a deeper rendered-page
scan + scheduled monitoring are the planned Pro tier (needs a serverless deploy).

A [Copper Bay Labs](https://copperbaytech.com) product · part of the [forge](https://github.com/Dukotah/forge) factory.
