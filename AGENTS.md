<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Release verification

Before pushing any change intended for production, run a mobile viewport test at a phone-sized width (390px or equivalent). Confirm that the key changed screen renders, has no horizontal overflow, and has no browser console errors. Do not push until this verification has passed; report any limitation, such as missing local credentials or data, before requesting release approval.

For tracker controls, use the seeded fixture instead of a blank or personal-data screen: run `pnpm test:mobile:fixture`, open `/tracker?fixture=mobile` at a 390px viewport, and verify the description, project picker, billable control, start button, and an active timer are all visible and usable. The project picker must open and expose its search field. Record the viewport width, the absence of horizontal overflow, and any console errors before pushing.
