<img src="assets/icon.svg" width="64" height="64" alt="">

# Mool

Mool helps you understand what you own. Its first version is a private, browser-based dashboard for CDSL CAS statements. Open a password-protected PDF to see consolidated investments, statement values, broad exposure, reported MF gains and concentration. No statement uploads, accounts, analytics or persistent financial-data storage.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Select your CDSL PDF and enter its password using the instructions in your statement email. The PDF and password are processed in browser memory. Use **Clear statement** to clear the workspace.

```sh
npm test
npm run build
npm run preview
```

## Deploy

Import this repository into a static hosting provider such as Vercel, Netlify or Cloudflare Pages. Use `npm run build` as the build command and `dist` as the output directory. No server or environment variables are required. Serve the site over HTTPS so the browser can handle statements securely.

PDF.js, its worker, fonts, character maps and WebAssembly assets are served locally; no CDN is used. Dependency installation needs internet access. The app does not use localStorage, IndexedDB, remote AI or an upload endpoint. Development mode uses Vite's local development connection. For a minimal runtime, use the production build and preview command.

## Dashboard

- **Overview:** consolidated holdings by ISIN, expandable source positions, name/ISIN search, type filtering, sorting and exposure/custody breakdowns.
- **Performance:** reported MF folio invested amounts and unrealised gains, plus an interactive monthly statement-value chart. Demat positions with unavailable purchase costs are excluded from MF performance figures.
- **Concentration:** largest positions, top-five weight, identical investments held in multiple locations and visible gold/silver product exposure.
- **Validation:** parsed CDSL, NSDL and MF values reconcile independently against the CAS summary and overall total. Missing reference totals, unreadable rows, identifier checksum failures and quantity/value inconsistencies are flagged.
- **Source review:** source-page buttons open the extracted text. Raw statement text and identifiers are otherwise tucked away in extraction details. Location aliases avoid displaying account and folio identifiers in the holdings table.

## Scope and limits

The parser targets the supplied CDSL combined CAS layout with CDSL demat, NSDL demat and MF/RTA holdings. It was checked against user-supplied extracted text without copying that attachment into the repository. Tests use entirely synthetic account labels and amounts. Other statement layouts may need adaptation; reconciliation is an extraction consistency check, not verification of statement authenticity.

Names can wrap across PDF rows; extraction order may vary between PDFs. Asset exposure is a broad inference from security names, not a look-through into fund portfolios. Hybrid and unclassified exposures remain separate. Duplicate ISINs are combined across source positions, not discarded. Scanned PDFs are unsupported. Files are limited to 30 MB and 500 pages.

Values are as of the statement date. Monthly portfolio-value changes include contributions and withdrawals and are not investment returns. Reported MF unrealised gains do not include realised gains or distributions and do not represent total portfolio profit. XIRR, full cost history, stock overlap within funds, live prices, bond credit analysis and tax calculations are outside this version. No external market data is fetched.

Clearing a statement removes application references and the rendered financial data; closing/reloading the page also discards session state. This is not a guarantee of forensic memory erasure by the browser. PDFs are gitignored. Do not add personal statements or extracted personal text to the repository.
