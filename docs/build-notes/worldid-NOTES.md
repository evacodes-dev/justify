# World ID (Worldcoin) — Pre-validation NOTES

Source domain: https://docs.world.org (docs.worldcoin.org now redirects here).
Downloaded docs: `C:\Users\Вадим\hack-docs\worldid\`
Date gathered: 2026-06-11

> CRITICAL CONTEXT — TWO API GENERATIONS EXIST
> The live docs have moved to **World ID 4.0**, which uses a NEW flow:
> RP signatures, `rp_id`, `IDKitRequestWidget`, `nullifier`, and `POST /api/v4/verify/{rp_id}`.
> The classic flow the TZ describes (`IDKitWidget`, `verification_level`,
> `nullifier_hash`, `POST /api/v2/verify/{app_id}`, simulator) is the **LEGACY (v3.0 / "Cloud action")**
> path. It is STILL documented and STILL accepted by the API for backward compatibility,
> but it is no longer the default the docs steer you to. Decide which you target before coding.

---

## 1. IDKit React widget

- npm package: **`@worldcoin/idkit`** (React). Core (framework-agnostic) is `@worldcoin/idkit-core`.
  Install: `npm i @worldcoin/idkit`. Docs say use latest **4.x**.
  Source: https://docs.world.org/world-id/idkit/react ; https://docs.world.org/world-id/idkit/integrate

### Legacy / classic widget (what the TZ asks about) — `IDKitWidget`
The classic drop-in widget exposed these props:
- `app_id` — your app ID from the Developer Portal. **Staging apps use the prefix `app_staging_...`**
  (production apps are `app_...`). NOTE: this exact `app_staging_` string is NOT shown verbatim
  on the current 4.0 doc pages (they only show `app_xxxxx` placeholders); it comes from the
  established legacy World ID v2 docs. Treat as "very likely correct, but not re-confirmed in
  the pages I downloaded today." See Flags below.
- `action` — the action identifier you created in the Developer Portal (TZ action: `create-market`).
- `signal` — optional value bound into the proof (e.g. user id / wallet); backend must enforce the same value.
- `verification_level` — `orb` or `device`. Controls credential strength requested.
- `onSuccess(proof)` — callback fired with the proof payload after the user verifies.

**Classic `onSuccess` proof payload shape** (this is the body you forward to v2 verify):
```json
{
  "merkle_root": "0x...",
  "nullifier_hash": "0x...",
  "proof": "0x...",
  "verification_level": "orb"        // "orb" | "device"
}
```
(Confirmed via the v2 verify request schema — see section 2 — which requires exactly
`nullifier_hash`, `merkle_root`, `proof`, `verification_level`, `action`.)

### Current 4.0 widget — `IDKitRequestWidget` (for reference; different API)
Props: `app_id`, `action`, `rp_context` (`{ rp_id, nonce, created_at, expires_at, signature }`),
`allow_legacy_proofs`, `preset` (e.g. `orbLegacy({ signal })`, `selfieCheckLegacy(...)`),
`environment` (`"production"` | `"staging"`), `handleVerify` (optional backend check),
`onSuccess` (required), `onError`.
The 4.0 IDKit response uses **`nullifier`** (not `nullifier_hash`) and a `responses[]` array,
and requires backend-generated **RP signatures** (a `signing_key` secret) before each request.
Source: https://docs.world.org/world-id/idkit/react ; .../idkit/integrate

---

## 2. Server-side Verify API

### LEGACY v2 endpoint (what the TZ wants) — CONFIRMED
Exact endpoint:
```
POST https://developer.world.org/api/v2/verify/{app_id}
```
(Legacy domain `https://developer.worldcoin.org/api/v2/verify/{app_id}` also works;
staging domain: `https://staging-developer.worldcoin.org`.)
`{app_id}` = your app id from the Developer Portal.

Request body (JSON) — required fields: `nullifier_hash`, `proof`, `merkle_root`,
`verification_level`, `action`. Optional: `signal_hash`, `max_age`.
```json
{
  "nullifier_hash": "0x2bf8...fbd8",
  "merkle_root":    "0x2264...0bc2",
  "proof":          "0x1aa8...",
  "verification_level": "orb",
  "action": "create-market",
  "signal_hash": "0x00c5...85a4",   // optional; defaults to hash of empty string
  "max_age": 3600                    // optional; 3600..604800, default 7200
}
```
Success (200) response:
```json
{
  "success": true,
  "action": "create-market",
  "nullifier_hash": "0x2bf8...fbd8",
  "created_at": "2023-02-18T11:20:39.530041+00:00"
}
```
Error (400) `code` values: `invalid_proof`, `invalid_merkle_root`, `root_too_old`,
`exceeded_max_verifications`, `already_verified`, plus `invalid` (credential type).
Source: https://docs.world.org/api-reference/developer-portal/verify-legacy

### Current v4 endpoint (4.0 flow) — for reference
```
POST https://developer.world.org/api/v4/verify/{rp_id}
```
Body keyed by `protocol_version` ("3.0" legacy proofs or "4.0"), `nonce`, `action`,
`responses[]`. Success response returns `success`, `action`, `nullifier`, `results[]`,
`environment`. Use this only if you go full World ID 4.0 (RP signatures required).
Source: https://docs.world.org/api-reference/developer-portal/verify

> IMPORTANT: the v2 response gives you **`nullifier_hash`** and the v4 response gives you
> **`nullifier`**. In BOTH cases YOU must store it and reject reuse per (app/rp + action) —
> the API only confirms the proof is cryptographically valid, not first-use.

---

## 3. Worldcoin Simulator (staging proofs, no real Orb)

- URL: **https://simulator.worldcoin.org/** (live, HTTP 200 confirmed today).
- Usage per docs: "You can test during development using the simulator and setting
  `environment` to `"staging"`."  Source: https://docs.world.org/world-id/idkit/integrate (Step 4).
- Flow: build your IDKit request with `environment: "staging"` (or, for the classic widget,
  point the widget at staging), generate the connect URL / QR code, then open that connect
  URL in the **Worldcoin Simulator** instead of the real World App. The simulator acts as a
  fake World App and produces a **staging proof** so you never need a physical Orb.
- The staging proof verifies against the verify endpoint when you also send
  `environment: "staging"` (v4) / use a staging app (`app_staging_...`, v2).

---

## 4. What you must create in the Developer Portal

Portal: https://developer.world.org (legacy: developer.worldcoin.org).
1. Create an **app** → get an `app_id`. For testing create/use a **staging** app
   (`app_staging_...`) so the simulator's staging proofs validate.
   (4.0 also gives you `rp_id` + a `signing_key` secret — only needed for the 4.0 flow.)
2. Create an **action** on that app. TZ requires the action name: **`create-market`**.
   The same action string must be passed to IDKit AND to the verify call.

### verification_level: orb vs device (simulator implications)
- `orb` = high-assurance, biometric uniqueness captured by the Orb.
- `device` = lower-assurance, device-based.
- The **Simulator can generate staging proofs for testing without a real Orb**, including
  Orb-level staging proofs — that is the whole point of staging mode. So a staging
  `app_staging_...` + the `create-market` action + the simulator is enough to exercise the
  full client → backend → verify loop without any hardware.
- For PRODUCTION, real `orb` proofs require a user who has actually been Orb-verified;
  `device` proofs do not. Choose `verification_level` based on how strong a uniqueness
  guarantee `create-market` needs.

---

## 5. Flags — things the downloaded docs do NOT directly answer

1. **`app_staging_...` literal prefix** is NOT printed on the current 4.0 doc pages (they show
   only `app_xxxxx`). It is standard in the legacy World ID v2 docs and in the Developer Portal
   UI, but I could not re-confirm the exact string from a page I downloaded today. Verify in the
   Developer Portal when you create the staging app.
2. **Classic `IDKitWidget` full prop reference** (the `IDKitWidget` component, not the new
   `IDKitRequestWidget`) is no longer the primary React doc — the live React page documents the
   4.0 `IDKitRequestWidget`. The classic prop names listed above (`app_id`, `action`, `signal`,
   `verification_level`, `onSuccess`) are corroborated by the v2 verify request schema but not by
   a current side-by-side widget prop table. If you must use the exact classic widget, pin an
   older `@worldcoin/idkit` (pre-4.x) version and check that version's README.
3. **Simulator step-by-step UI walkthrough** is not in the docs — only the one-line instruction
   (set `environment: "staging"`, use simulator.worldcoin.org). No dedicated simulator doc page
   exists in the index.
4. Docs steer new integrations to 4.0 (RP signatures + `/api/v4/verify`). If the hackathon
   expects the simpler classic v2 flow, you are intentionally using the **legacy** path — it is
   supported but consider whether judges expect 4.0.

---

## Quick-reference summary
- IDKit package: `@worldcoin/idkit` (React) — classic widget `IDKitWidget`, 4.0 widget `IDKitRequestWidget`.
- Verify v2 (legacy, what TZ wants): `POST https://developer.world.org/api/v2/verify/{app_id}`
  body `{nullifier_hash, merkle_root, proof, verification_level, action}` →
  `{success, action, nullifier_hash, created_at}`.
- Verify v4 (current): `POST https://developer.world.org/api/v4/verify/{rp_id}`.
- Simulator: https://simulator.worldcoin.org/ + `environment: "staging"` → staging proofs, no Orb. CONFIRMED.
- Create in portal: staging `app_id` (+ 4.0: `rp_id`, `signing_key`) and action `create-market`.
</content>
</invoke>

## РЕЗУЛЬТАТ ТЕСТА 5 (build) — собрано под World ID 4.0, ожидание creds
- `app/app/worldid/page.tsx` (IDKitRequestWidget, environment="staging"), `app/app/api/rp-signature/route.ts` (signRequest), `app/app/api/verify-proof/route.ts` (→ /api/v4/verify/{rp_id} + nullifier-reuse 409). tsc OK, /worldid отдаёт 200.
- Пакеты: @worldcoin/idkit + @worldcoin/idkit-core.
- ⛔ Нужно из developer.world.org (включить "World ID 4.0" / RP registration): **app_id, rp_id, signing_key (hex)** + action `create-market`. Переданный ранее `api_...` ключ — это Developer Portal API key (key_..:sk_..), НЕ эти три значения.
- Прогон: симулятор simulator.worldcoin.org (staging) → бэкенд-верификация → nullifier. Вердикт ставит юзер по UI.
