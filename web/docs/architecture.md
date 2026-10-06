# Clipboard X Web architecture

> English · [简体中文](architecture_CN.md)

The Web package is a single-entry, client-rendered React SPA. After login, the home page is a Channel clipboard workspace: switch Channels on the left and preview or act on clipboard cards in an independently scrolling center region. Channel creation, editing, and content publication use dialogs. The Devices shortcut sits between the theme and settings buttons; activity, configuration, and account pages live in the settings menu. The configuration page currently manages only periodic cleanup of server-side clipboard data; it does not govern local client history.

Bun handles workspace dependencies, scripts, and tests. Vite provides the development server and production build. `src/App.tsx` composes the app, and `src/main.tsx` is its sole browser entry. The production build writes `web/dist`; the root release process packages it with the Server executable, which serves it from the same origin.

## Infrastructure

- React 19, strict TypeScript, and Vite.
- React Router Declarative Mode. Flat Route Nodes in `src/routes` are the navigation source of truth; `frame/router/core` validates and compiles them, and `Router.View` creates the sole `BrowserRouter`.
- Zustand owns the non-sensitive authentication summary, route publication, recent page, and theme preference. Components retain their local interaction state.
- Axios stays inside `frame/request/transport.ts`. The application API binds immutable Endpoints, and pages use `useApi()` without accessing Axios types or instances.
- Zod validates browser storage, untrusted Route Nodes, and Admin API JSON responses. The Vite configuration checks the proxy URL loaded from `web/.env*`.
- TanStack Query manages server resources, polling, and query invalidation after mutations; it does not own client state.
- Tailwind CSS 4, CSS variables, and shadcn/ui components based on Base UI (`base-nova`). Shared UI source lives in `frame/components/ui`.

## Dependency direction

`pages` composes `api`, `stores`, application components, and `frame`. The `api`, `routes`, and `stores` packages may depend on `frame`; `frame` does not import product APIs, pages, route definitions, or application stores. Server and Web do not import one another's source code.

## API and authentication

The Admin API uses same-origin `/admin/api/v1` and an HttpOnly, SameSite=Strict session cookie. The request client does not accept an API origin, and the production bundle has no runtime backend selector. Successful responses are parsed directly against the Endpoint's Zod schema; errors use `{ error: { code, message, requestId, details } }` and map to stable `RequestError` categories.

Administrator passwords and session cookies are never stored in browser storage. Zustand keeps only a non-sensitive administrator summary and credential revision; the Server remains authoritative for the session. There is no refresh-token endpoint, so a 401 leads the authenticated layout back to login rather than triggering a fabricated refresh or implicit retry.

To publish text or an image, Web creates a manifest through the Admin API, uploads its preview and eager complete content, then completes publication. The Server attributes it to its virtual device; Web neither creates nor holds an API key for that device. The virtual device is read-only in device settings and cannot be edited, disabled, deleted, or issued keys.

Device settings register a client-generated DeviceId before issuing, rotating, or revoking its bound keys. Administrators can disable or delete a device. The client owns its name and icon and sends profile changes through the Device API; Web displays these fields without offering an edit form.

An image card initially reads the thumbnail already stored by the Server. When the user opens its preview and the full representation is not yet present, the page requests materialization from the source device and polls the transfer. Once complete, both card and detail view use the full image stored by the Server, with copy-image and download actions.

## Routes and layout

`routes/base.ts` defines login, error, 404, and catch-all routes. `routes/app.ts` defines the clipboard workspace and settings pages. `routes/user.ts` parses untrusted extension nodes with Zod. The root path is the primary workspace; former overview, Channel, clipboard, and transfer paths redirect. Even without remote routes, the composition root publishes an empty user route set so `ready` is reached only after the complete route graph is published.

Component keys map only to the static lazy registry in `App.tsx`, which splits pages by route. The `normal` and `empty` layouts are registered explicitly; unknown components or layouts do not silently fall back. Development shows diagnostic details, while production shows a generic failure message.

## Browser storage and theme

`frame/common/storage` uses an envelope with version, write time, optional expiry, and data; all reads pass Zod validation. Only the theme preference and recoverable recent page are persisted—not passwords, cookies, API keys, or clipboard content. Cross-tab updates use storage events; same-tab writes notify explicitly, and the last writer wins.

A Zustand theme store manages light, dark, and system themes and toggles the root `.dark` class. Product components consume semantic tokens.

## Packaging boundary and development proxy

- Web does not read, parse, or modify `config.yaml`; that file belongs to Server.
- Web has no API-origin, Server-host/port, or standalone deployment configuration. The Router basename is `/`.
- `scripts/build.ts` runs the Vite build and packages `web/dist` with the Server executable.
- The Vite development server uses port `3000`. Its proxy target comes only from `CBX_PROXY_URL` in `web/.env*`, without a `VITE_` prefix. The current Vite configuration requires this variable whenever it loads, including for production builds; the variable is not exposed to browser code. Administrator requests prefer the browser's `Sec-Fetch-Site` check. To support clients without that header, Server can explicitly set `web.public-origin` to the origin used to access Vite.

Only Server parses listener, database, object storage, administrator, device authorization, key, and Channel configuration with `yaml`, and its console writes updates atomically. Client-owned device names and icons are SQLite runtime data, not YAML configuration.

## Current scope

There is no form-state library, SSR, micro-frontend, remote menu, or keep-alive page cache. Adding these capabilities requires a separate product need and architecture decision.
