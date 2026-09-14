# React + TypeScript + Vite

## Inspection And Disposal Prototype

- My Assets includes asset overview and receipt-level inspection/disposal views. Sample receipts in `src/disposals.ts` are separate historical snapshots and do not subtract from live inventory or appraisal values.
- Inspection detail separates accepted assets (including grade) from disposal candidates. Customer guidance shows receipt and inspection-completion dates, acknowledgement, and an inquiry modal. Acknowledgement does not grant disposal consent. Disposal processing/cost sections and consent controls are not shown in this view.
- Inquiries are recorded locally, without an inline history. Guidance requests inquiries within two days after inspection completion and notes that disposal costs may be charged separately; the prototype does not enforce a submission deadline or deliver inquiries.
- Processing and cost states are independent. Unknown amounts are `null`, never zero. Only billed disposal costs enter settlement totals, period filters, and CSV exports. The demo includes one 65,000 KRW invoice (tax included); the 48,000 KRW estimate is excluded.
- Notification, inspection detail, and settlement links share the receipt ID. Read status and saved acknowledgement/consent/comments survive navigation but reset on reload. Unsaved drafts are local to the detail view.
- Reports and processing evidence are examples. No real photos, email delivery, objection submission, payments, or backend persistence are connected. Production requires authenticated operator updates, actual evidence uploads, delivery logs, versioned consent and cost records, and server-side authorization/audit history.

## Market Campaign Configuration

Market banners are configured in the `campaigns` array in [src/MarketCampaigns.tsx](src/MarketCampaigns.tsx). There is no admin editor or backend persistence yet; configuration changes require deployment.

- Keep `id` unique and stable. Edit `title` and `description` for campaign copy.
- Set `category` to an existing catalog category. The CTA clears search and offer filters, selects that category, and focuses the product list. Images use the existing category reference photos and credits.
- Use `enabled` to publish or hide a campaign, and `order` for ascending display priority.
- Set `startsAt` and `endsAt` to ISO timestamps with an explicit timezone, for example `2026-10-01T00:00:00+09:00`. `null` means no boundary. Start is inclusive; end is exclusive. Visibility refreshes every 30 seconds using the device clock.
- If the selected campaign expires, the first active campaign is shown. If none are active, the banner is hidden.
- Members and guests share the campaigns. Guest banners contain no prices or discount amounts; existing login requirements remain in place.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
