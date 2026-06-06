# CGuardPro — Worker App

Field mobile app for **security guards** and **supervisors**, built with
**Ionic React + Capacitor + Tailwind v4 (Vite)**. It links to the existing
`backend` API and is gated so that **only `securityGuard` and
`securitySupervisor` roles** can sign in.

## Stack

- **Ionic React 8** — native mobile shell (tabs, page transitions, safe areas)
- **Capacitor 6** — wraps the web build into iOS / Android
- **Tailwind v4** — custom dark-navy + gold design (matches the Figma)
- **react-i18next** — Spanish / English, auto-detected from the device
- **Recharts** — dashboard / report charts

## Backend linking

The app talks to the same API as the web `frontend`:

| Concern      | How                                                                 |
| ------------ | ------------------------------------------------------------------- |
| Base URL     | `VITE_API_URL` in `.env` (default `https://api.cguardpro.com/api`)  |
| Auth         | `POST /auth/sign-in` → `{ token, user }`, JWT stored in `authToken` |
| Profile      | `GET /auth/me`                                                      |
| Tenant scope | `tenantId` taken from `user.tenants[0]`, used in `/tenant/:id/...`  |
| Role gate    | login rejected unless the user holds `securityGuard` or `securitySupervisor` (see `src/lib/roles.ts`) |

Key endpoints used: `/tenant/:id/guard/me*` (guard dashboard, clock in/out,
schedule, time-off), `/tenant/:id/incident`, `/tenant/:id/patrol(+-checkpoint)`,
`/tenant/:id/guard-shift`, `/tenant/:id/security-guard(/active-locations)`,
`/operations/kpis`.

## Roles → experience

- **securityGuard** → bottom tabs: Dashboard (GPS clock in/out, shifts, posts),
  Schedule, Patrol checkpoints, Incidents (+ report), Profile.
- **securitySupervisor** → bottom tabs: Operations dashboard, Check-In/Out,
  Incidents, Patrol Tracking, More (Schedule, Reports, Profile).

## Develop (web)

```bash
cp .env.example .env        # set VITE_API_URL (use localhost for dev backend)
npm install
npm run dev                 # http://localhost:5174
npm run build               # type-check + production build to dist/
```

## Native (Capacitor)

Native projects are **not** committed (they need Xcode / Android Studio).
Generate them once locally:

```bash
npm run build
npx cap add ios
npx cap add android
npm run cap:sync            # cap sync — copies dist/ + plugins into native
npx cap open ios           # or: npm run cap:ios
npx cap open android       # or: npm run cap:android
```

Geolocation (used for clock-in) needs native permissions:

- **iOS** — add `NSLocationWhenInUseUsageDescription` to `ios/App/App/Info.plist`.
- **Android** — `ACCESS_FINE_LOCATION` is added by `@capacitor/geolocation`.

App id / name live in `capacitor.config.ts` (`com.cguardpro.operaciones`).
