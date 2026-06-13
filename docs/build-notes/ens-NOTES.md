# ENS on Sepolia — Subname + Text Records Pre-Validation Notes

Scope: issue `alice.<name>.eth` (where `<name>.eth` is owned by the user and **WRAPPED** in NameWrapper),
set a text record, and read it back. Using on-chain contracts + `@ensdomains/ensjs` + `viem`.
Date: 2026-06-11. All facts below are from official docs / official source (URLs cited at bottom).

---

## 1. Contract + method to issue the subname

### If `<name>.eth` is WRAPPED in NameWrapper (the assumed case)
- **Contract:** `NameWrapper`
- **Method:** `setSubnodeRecord` (NOT `setSubnodeOwner`)
- **Signature:**
  ```
  NameWrapper.setSubnodeRecord(
    bytes32 parentNode,   // namehash of <name>.eth
    string  label,        // "alice"
    address owner,        // owner of the new subname
    address resolver,     // PublicResolver address (so records can be set)
    uint64  ttl,          // typically 0
    uint32  fuses,        // permission bits, 0 if none
    uint64  expiry        // subname expiry timestamp
  )
  ```
- **Why `setSubnodeRecord` not `setSubnodeOwner`:** `setSubnodeOwner(parentNode, label, owner, fuses, expiry)`
  does NOT take a `resolver`. You need the resolver set so you can immediately write text records.
  `setSubnodeRecord` adds `resolver` + `ttl`. Use `setSubnodeRecord` for a one-tx "create + assign resolver".

### Wrapped vs UNWRAPPED caveat — FLAG (changes the script)
The `contract` you call depends on the parent name's wrap state:
- **WRAPPED parent → NameWrapper.setSubnodeRecord** (7 args incl. `fuses` + `expiry`).
- **UNWRAPPED / only registered parent → ENS Registry.setSubnodeRecord** — different contract,
  different signature, NO fuses/expiry:
  ```
  ENSRegistry.setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)
  ```
  (`label` here is the labelHASH, not the string label.)
- The manager/owner check also differs: unwrapped uses Registry `owner(node)`; wrapped uses NameWrapper `ownerOf(uint256(node))`.

**Action item:** before running, confirm whether the parent name is wrapped. If you registered via the
current sepolia.app.ens.domains UI it is typically wrapped, but verify (e.g. ensjs `getOwner` returns the
NameWrapper-aware ownership). Picking the wrong contract = revert.

---

## 2. Sepolia addresses (confirmed in BOTH the deployments page AND ensjs source consts.ts)

| Contract                 | Sepolia address |
|--------------------------|-----------------|
| **NameWrapper**          | `0x0635513f179D50A207757E05759CbD106d7dFcE8` |
| **PublicResolver**       | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| ENS Registry             | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| UniversalResolver        | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| BaseRegistrar            | `0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85` |
| ETHRegistrarController    | `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` |

Note: ensjs also exposes a `legacyPublicResolver` (`0x0CeEC...A48`) and `wrappedPublicResolver`
(`0x8948...cC51`) on Sepolia. For new subnames use the canonical **ensPublicResolver** above.

---

## 3. @ensdomains/ensjs — functions, signatures, versions

- **Package:** `@ensdomains/ensjs`  **version 4.2.3** (latest on main).
- **viem peer dep:** `^2.x` (source pins `viem ^2.37.12` / `^2.35.0`). Install: `npm i @ensdomains/ensjs viem`.
- **Sepolia is natively supported:** ensjs `supportedChains = [mainnet.id, sepolia.id]`. Use `addEnsContracts(sepolia)`
  — it injects all the Sepolia addresses above into the viem chain, so you do NOT pass addresses manually.

### Client setup
```ts
import { createPublicClient, createWalletClient, http, custom } from 'viem'
import { sepolia } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'

const publicClient = createPublicClient({
  chain: addEnsContracts(sepolia),
  transport: http(),
})
const wallet = createWalletClient({
  chain: addEnsContracts(sepolia),
  transport: custom(window.ethereum), // or an account-based transport
})
```

### Create the subname  →  `createSubname` (from `@ensdomains/ensjs/wallet`)
This is the ensjs wrapper that emits the `setSubnodeRecord` call described in §1.
```ts
import { createSubname } from '@ensdomains/ensjs/wallet'

const hash = await createSubname(wallet, {
  name: 'alice.<name>.eth',
  owner: '0xYourOrSubnameOwnerAddress',
  contract: 'nameWrapper',          // <-- KEY: 'nameWrapper' for wrapped parent, 'registry' if unwrapped
  resolverAddress: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5', // PublicResolver (optional; defaults to chain ensPublicResolver)
  // fuses / expiry only allowed when contract === 'nameWrapper'
  // expiry?: Date|bigint,  fuses?: {...}
})
```
Confirmed from source: `contract: 'registry' | 'nameWrapper'`.
- `'nameWrapper'` → encodes `NameWrapper.setSubnodeRecord(parentNode, label, owner, resolver, 0, fuses, expiry)`.
- `'registry'` → encodes `ENSRegistry.setSubnodeRecord(parentNode, labelhash, owner, resolver, 0n)` — `fuses`/`expiry` are `never` (compile error if passed).
- If `resolverAddress` omitted, it defaults to the chain's `ensPublicResolver`. Pass a resolver so you can set records next.

### Set text record(s)
Two options, both from `@ensdomains/ensjs/wallet`:

- Single text record → **`setTextRecord`**:
  ```ts
  import { setTextRecord } from '@ensdomains/ensjs/wallet'
  const hash = await setTextRecord(wallet, {
    name: 'alice.<name>.eth',
    key: 'description',
    value: 'hello hackathon',
    resolverAddress: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
  })
  ```
- Multiple records at once (texts + coins + contenthash + abi) → **`setRecords`** (multicall):
  ```ts
  import { setRecords } from '@ensdomains/ensjs/wallet'
  const hash = await setRecords(wallet, {
    name: 'alice.<name>.eth',
    texts: [{ key: 'description', value: 'hello' }, { key: 'com.twitter', value: 'me' }],
    coins: [{ coin: 'ETH', value: '0x...' }],
    resolverAddress: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
  })
  ```
Underlying resolver call (informational): `PublicResolver.setText(bytes32 node, string key, string value)`.

---

## 4. Reading records back — two independent paths

### Path A — ensjs (public client)
- Single text → **`getTextRecord`** (from `@ensdomains/ensjs/public`):
  ```ts
  import { getTextRecord } from '@ensdomains/ensjs/public'
  const v = await getTextRecord(publicClient, { name: 'alice.<name>.eth', key: 'description' })
  // => 'hello hackathon' | null
  ```
- Bundle (texts + coins + contenthash) → **`getRecords`** (from `@ensdomains/ensjs/public`):
  ```ts
  import { getRecords } from '@ensdomains/ensjs/public'
  const r = await getRecords(publicClient, {
    name: 'alice.<name>.eth',
    texts: ['description', 'com.twitter'],
    coins: ['ETH'],
    contentHash: true,
  })
  ```
  (Note ensjs read API is `getTextRecord` / `getRecords`, not `getText`/`getRecords`-singular.)

### Path B — viem directly (independent cross-check)
```ts
import { normalize } from 'viem/ens'
const text = await publicClient.getEnsText({ name: normalize('alice.<name>.eth'), key: 'description' })
const addr = await publicClient.getEnsAddress({ name: normalize('alice.<name>.eth') })
```
viem notes / Sepolia considerations:
- **Must `normalize()` the name** before passing to `getEnsText` / `getEnsAddress` (ENSIP-15). Non-normalized input can throw or mis-resolve.
- viem resolves through the **UniversalResolver**. Because `addEnsContracts(sepolia)` is NOT applied to a
  plain viem chain, when using raw `viem/chains` `sepolia` viem already knows the Sepolia UniversalResolver,
  but if you hit "UniversalResolver not found" pass it explicitly:
  `getEnsText({ name, key, universalResolverAddress: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe' })`.
- **CCIP-Read:** `getEnsText`/`getEnsAddress` support offchain CCIP-Read (`gatewayUrls`, `strict` options). For a
  plain on-chain PublicResolver subname (our case) CCIP-Read is NOT involved — it only matters if the subname
  uses an offchain/L2 resolver. So for this hackathon flow you can ignore gatewayUrls.

---

## 5. Gas cost notes
The official docs do not publish a fixed gas figure for `setSubnodeRecord` / one subname. Practical notes:
- Issuing one wrapped subname via `NameWrapper.setSubnodeRecord` is a single state-writing tx (creates the node,
  sets owner, resolver, ttl, fuses, expiry). Order-of-magnitude ~100k–200k gas; varies with fuses/expiry and
  whether the resolver slot is newly written. On Sepolia gas is free-ish (testnet ETH) so not a blocker.
- Setting text records: `setTextRecord` = 1 tx per key; `setRecords` batches multiple into one multicall tx
  (cheaper than N separate txs if setting several). No official gas number given.
- **Recommendation:** use `setRecords` if writing >1 record; budget for 2 txs total minimum
  (create subname, then set records) unless you set the resolver in create and records separately.

---

## 6. Downloaded docs (local copies)
Saved under `C:\Users\Вадим\hack-docs\ens\`:
- `wallet.createSubname.md`, `wallet.setRecords.md`, `wallet.setTextRecord.md`
- `public.getRecords.md`, `public.getTextRecord.md`, `public.getAddressRecord.md`
- `ensjs-consts.ts` (Sepolia addresses + supportedChains), `ensjs.package.json` (version + viem dep)
- `deployments.html`, `wrapper-contracts.html`, `web-records.html`, `resolvers-interacting.html`

## 7. Source URLs (official)
- Deployments / Sepolia addresses: https://docs.ens.domains/learn/deployments
- NameWrapper contract (setSubnodeRecord / setSubnodeOwner): https://docs.ens.domains/wrapper/contracts
- Subdomains overview: https://docs.ens.domains/web/subdomains
- Text records: https://docs.ens.domains/web/records  (ENSIP-5: https://docs.ens.domains/ensip/5)
- Resolver interacting (setText / text): https://docs.ens.domains/resolvers/interacting
- ensjs createSubname: https://github.com/ensdomains/ensjs/blob/main/docs/wallet/function.createSubname.md
- ensjs setRecords: https://github.com/ensdomains/ensjs/blob/main/docs/wallet/function.setRecords.md
- ensjs setTextRecord: https://github.com/ensdomains/ensjs/blob/main/docs/wallet/function.setTextRecord.md
- ensjs getRecords: https://github.com/ensdomains/ensjs/blob/main/docs/public/function.getRecords.md
- ensjs getTextRecord: https://github.com/ensdomains/ensjs/blob/main/docs/public/function.getTextRecord.md
- ensjs source consts (Sepolia addrs): https://github.com/ensdomains/ensjs/blob/main/packages/ensjs/src/contracts/consts.ts
- viem getEnsText: https://viem.sh/docs/ens/actions/getEnsText.html
- viem getEnsAddress: https://viem.sh/docs/ens/actions/getEnsAddress.html
</content>
</invoke>

## РЕЗУЛЬТАТ ТЕСТА 6 — FAIL на Sepolia (v1-регистрация закрыта контрактами)
On-chain доказательства (2026-06-11):
- Кошелёк-владелец `0x6751…88C0`: nonce=0, code=0x, ENS-NFT не получал → он НИЧЕГО не регистрировал. Переданный изначально `justify-test.eth` в реестре отсутствует (Sepolia и mainnet → 0x0).
- UI Sepolia ушёл на ENSv2; контракты тоже: живой контроллер `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` — **новый struct-based ABI** (`register(tuple)` с `referrer`), у него **нет `nameWrapper()`/`base()`** → он НЕ использует классический NameWrapper.
- Классический **NameWrapper `0x0635…` больше не controller на BaseRegistrar** (`controllers(NW)=false`); ни один controller не авторизован. → `register` ревертит пустым `0x` (минтить/оборачивать некому).
- Попытки: (1) ensjs commit/register — старый селектор `0xef9c8805`, ревертит; (2) прямой вызов нового struct-ABI — commit OK, register ревертит `0x` из-за отсутствия авторизации.
- **Вывод:** наш v1-тулинг (ensjs createSubname + NameWrapper + text records) на Sepolia новые имена выдать НЕ может. Старые v1-имена резолвятся, регистрация — нет.

### Fallback (проверено вживую)
- **Mainnet v1 — РАБОТАЕТ:** `BaseRegistrar.controllers(NameWrapper 0xD441…6401)=true`, base fee ~0.2 Gwei. Скрипты issue-subname.ts/read-profile.ts заработают как есть (сменить chain на mainnet, зарегать имя ~$5-6, субдомены — центы).
- **durin.dev (Base Sepolia 84532) — RPC доступен,** бесплатно, но другой тулинг (нужен код под durin-контракты). Это исходный fallback из ТЗ.
- Скрипты готовы: register-name.ts (под новый Sepolia-ABI — упирается в авторизацию), issue-subname.ts, read-profile.ts, check-parent.ts.

## SHOWCASE: jstfy-demo.eth ЗАВЁРНУТ в NameWrapper (mainnet)
- Было: имя unwrapped → субдомены через ENSRegistry.setSubnodeRecord (только labelhash на чейне) → ENS-апп показывал `[labelhash].jstfy-demo.eth` в скобках (резолвинг работал, но имя в UI не отображалось).
- Завернули: approve NameWrapper на BaseRegistrar (tx 0x048c31…) + wrapETH2LD("jstfy-demo") (tx 0x4d25f6…, block 25300839). NameWrapper.ownerOf(parent)=0x6751.
- Теперь НОВЫЕ субдомены минтятся через NameWrapper.setSubnodeRecord(string label) → показываются как `name.jstfy-demo.eth`. Старые (vadym/vadym2, registry) остаются в скобках — это тестовые.
- ГРАБЛЯ для пятницы: для красивого отображения субдоменов в ENS-апп родитель должен быть WRAPPED. Unwrapped → `[hash]` в UI (но on-chain резолв ок).
