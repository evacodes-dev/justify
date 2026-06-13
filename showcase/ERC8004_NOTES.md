# ERC-8004 (Trustless Agents) — Hackathon Research Notes

Researched 2026-06-13. Primary sources: EIP-8004 spec (eips.ethereum.org), the official
`erc-8004/erc-8004-contracts` repo (README + verified Solidity), Etherscan, ENS DAO forum/blog.
Docs mirrored to `C:\Users\Вадим\hack-docs\erc8004\` (eip-8004.html, erc-8004-contracts-README.md).

> Status: ERC-8004 is an EIP (Draft/Review). Identity + Reputation registries are deployed and
> AUDITED on Ethereum mainnet + 30+ chains. **Validation Registry is still under active revision
> with the TEE community** — its spec/interface may change. Treat Validation as unstable.

---

## 1. The three registries + on-chain interfaces

### Identity Registry — "who is the agent?"
Upgradeable ERC-721 (`ERC721URIStorage`). `tokenURI` = `agentURI` → JSON registration file.
`agentId` = the ERC-721 `tokenId`, minted incrementally on `register`.

```solidity
// REGISTER (3 overloads) -> returns agentId
function register() external returns (uint256 agentId);
function register(string memory agentURI) external returns (uint256 agentId);
function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId);

// READ / MANAGE IDENTITY
function setAgentURI(uint256 agentId, string calldata newURI) external;
function tokenURI(uint256 agentId) external view returns (string memory);   // standard ERC-721, = agentURI
function ownerOf(uint256 agentId) external view returns (address);          // standard ERC-721
function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;

// AGENT WALLET (reserved metadata key "agentWallet"; set to owner on mint, cleared on transfer)
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external; // EIP-712 / ERC-1271 proof
function getAgentWallet(uint256 agentId) external view returns (address);
function unsetAgentWallet(uint256 agentId) external;

event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
```

`MetadataEntry` is a `{ string key; bytes value; }` struct (passed as array in the register overload).

### Reputation Registry — "how has it performed?"
Stores feedback as a signed fixed-point number: `value` (int128) + `valueDecimals` (uint8, 0–18).
e.g. value=9977, decimals=2 → 99.77. Self-feedback by the agent owner/operators is blocked.

```solidity
// WRITE FEEDBACK
function giveFeedback(
    uint256 agentId,
    int128  value,
    uint8   valueDecimals,
    string calldata tag1,
    string calldata tag2,
    string calldata endpoint,
    string calldata feedbackURI,
    bytes32 feedbackHash
) external;

// READ
function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
    external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked);

function readAllFeedback(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2, bool includeRevoked)
    external view returns (address[] memory clients, uint64[] memory feedbackIndexes, int128[] memory values, uint8[] memory valueDecimals, string[] memory tag1s, string[] memory tag2s, bool[] memory revokedStatuses);

// AGGREGATE — clientAddresses MUST be non-empty (anti-Sybil)
function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
    external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

// REVOKE / RESPOND / HELPERS
function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string calldata responseURI, bytes32 responseHash) external;
function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
function getClients(uint256 agentId) external view returns (address[] memory);

event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
    int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2,
    string endpoint, string feedbackURI, bytes32 feedbackHash);
event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
    address indexed responder, string responseURI, bytes32 responseHash);
```

### Validation Registry — "was the work independently verified?" (UNSTABLE)
```solidity
function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external; // caller = agent owner/operator
function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external; // caller = the requested validator
function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate);
function getSummary(uint256 agentId, address[] calldata validatorAddresses, string tag) external view returns (uint64 count, uint8 averageResponse);
function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes);
function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes);
```

---

## 2. Mainnet deployed addresses (CONFIRMED on Etherscan)

Deployed via deterministic CREATE2 — **same address on every mainnet** (Ethereum, Base, Arbitrum,
Optimism, Polygon, etc.). Source: repo README deployment table + Etherscan verification.

| Registry            | Ethereum Mainnet address                       | Status |
|---------------------|------------------------------------------------|--------|
| Identity Registry   | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`   | VERIFIED on Etherscan. ERC1967 proxy → "8004: Identity Registry Impl". ERC-721 "AgentIdentity (AGENT)". Created 2026-01-29. ~16k+ txns. Impl: `0x7274e874ca62410a93bd8bf61c69d8045e399c02` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`   | Listed in official repo README for ETH mainnet (and all chains). **MUST-VERIFY on Etherscan UI before relying for prod** (I confirmed Identity directly; Reputation is from the official repo table, address pattern consistent across 30+ chains). |

Sepolia testnet (for dev): Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`,
Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`.

**Validation Registry mainnet address: NOT published** in the repo table → MUST-VERIFY (spec in flux).

> Note: a KuCoin blog claimed the Identity Registry was `0x8004A818BFB912233c491871b3d84c89A494BD9e`
> — that is the **Sepolia** address, NOT mainnet. Do not use it on L1. Trust the repo + Etherscan.

---

## 3. How an agent is identified + ENS / ENSIP-26 binding

On-chain global ID (no ENS required):
- **agentRegistry** = CAIP-style `{namespace}:{chainId}:{identityRegistry}`, e.g. `eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **agentId** = the ERC-721 tokenId.
Off-chain files (registration JSON, feedback JSON) carry both fields to tie back on-chain.

ENS binding (human-readable name → agentId) is layered ON TOP via **ENSIP-25/26** + ENS text records.
It is the resolver/text-record side that links `bot.user.justify.eth` to an ERC-8004 agentId:

- `registrations[0]` text record → CAIP-19 ref: `eip155:1:0x<identityRegistry>:eip721:<agentId>`
- `agent-endpoint[ens-acs]` → `https://<gateway>/.well-known/agent/<contractAddress>/<agentId>.json`
- `agent-endpoint[mcp]`, `agent-endpoint[a2a]` → protocol endpoints
- `agent-context` → free-form context, can point at the ERC-8004 registry
Resolution can use CCIP-Read (EIP-3668) so subdomains resolve dynamically without on-chain writes.

To associate `bot.user.justify.eth` with agentId N: as the name owner, set the text records above on
that name (esp. `registrations[0] = eip155:1:0x8004A169...:eip721:N`), and conversely advertise the
ENS name inside the agent's registration JSON `services` list. The two-way link = the binding.

Live example: **dinamic.eth** (https://dinamic.eth.limo) runs a multi-tenant ERC-8004 registry where
NFT holders mint an agent, bind it to ENS, and get MCP/A2A endpoints. Probe with viem:
`client.getEnsText({ name: 'dinamic.eth', key: 'agent-endpoint[ens-acs]' })`.

> MUST-VERIFY: exact ENSIP-26 record key spelling (`registrations[0]` vs `agent-context` encoding)
> is still settling — confirm at the ENS hackathon stand / current ENSIP-26 draft before hardcoding.

---

## 4. Registration cost / gas (rough — MUST-VERIFY with a sim)
No authoritative gas table published. Estimates only:
- `register()` mints an ERC-721 + writes agentWallet metadata → expect ~roughly 100k–200k gas
  (typical NFT mint + an SSTORE or two). On L1 cost scales with gas price; on Base/L2s pennies.
- `giveFeedback(...)` ≈ a few SSTOREs + event with string args → community reports ~$0.01–0.05 on Base.
Before demo, simulate with viem `publicClient.estimateContractGas` against the real contract.

---

## 5. Reputation entry shape — mapping accuracy / pnl / markets

On-chain stored per feedback entry: `value` (int128), `valueDecimals` (uint8), `tag1`, `tag2`,
`isRevoked` (bool), `feedbackIndex` (uint64), `clientAddress`. Emitted-but-not-stored: `endpoint`,
`feedbackURI`, `feedbackHash` (hash of the rich off-chain JSON).

Mapping our metrics — use one feedback call per metric, distinguished by `tag1`/`tag2`:
| Metric    | value (int128)        | valueDecimals | tag1        | tag2 / endpoint        |
|-----------|-----------------------|---------------|-------------|------------------------|
| accuracy  | 9977 (=99.77%)        | 2             | "accuracy"  | market id, e.g. "BTC"  |
| pnl       | 12500 (=$125.00) or bps | 2           | "pnl"       | "USD" or "bps"         |
| markets   | count or per-market score | 0         | "markets"   | specific market tag    |

Put full context (per-trade pnl, transcript, model/version, payment proof) in the off-chain JSON
referenced by `feedbackURI` + committed via `feedbackHash`. Aggregate later with
`getSummary(agentId, [ourClientAddrs], "accuracy", "BTC")` etc. (clientAddresses MUST be non-empty).

---

## 6. viem-ready ABI fragments

```ts
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { mainnet, baseSepolia } from 'viem/chains';

export const IDENTITY_REGISTRY  = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const; // ETH mainnet (verified)
export const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const; // ETH mainnet (repo; verify)
// Sepolia: Identity 0x8004A818BFB912233c491871b3d84c89A494BD9e / Reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713

export const identityAbi = parseAbi([
  'function register() external returns (uint256 agentId)',
  'function register(string agentURI) external returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function ownerOf(uint256 agentId) external view returns (address)',
  'function tokenURI(uint256 agentId) external view returns (string)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

export const reputationAbi = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) external view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external',
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
]);

// --- register an agent (returns agentId from the Registered event / sim result)
const walletClient = createWalletClient({ chain: mainnet, transport: http(), account });
const hash = await walletClient.writeContract({
  address: IDENTITY_REGISTRY, abi: identityAbi,
  functionName: 'register', args: ['ipfs://<registration-file-cid>'],
});

// --- give feedback (e.g. accuracy 99.77% for BTC market)
await walletClient.writeContract({
  address: REPUTATION_REGISTRY, abi: reputationAbi,
  functionName: 'giveFeedback',
  args: [agentId, 9977n, 2, 'accuracy', 'BTC', '', 'ipfs://<feedback-json>', feedbackHash32],
});

// --- read aggregate (clientAddresses must be non-empty)
const pub = createPublicClient({ chain: mainnet, transport: http() });
const [count, summaryValue, decimals] = await pub.readContract({
  address: REPUTATION_REGISTRY, abi: reputationAbi,
  functionName: 'getSummary', args: [agentId, [ourClientAddr], 'accuracy', 'BTC'],
});
```

---

## Source URLs
- EIP spec: https://eips.ethereum.org/EIPS/eip-8004
- Official contracts repo: https://github.com/erc-8004/erc-8004-contracts
- Identity Registry on Etherscan: https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- Reputation Registry on Etherscan: https://etherscan.io/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
- ENSIP-26 (ENS native AI identity): https://discuss.ens.domains/t/ensip-26-ens-native-ai-identity/21968
- ENSIP-25 (verifiable AI agent identity): https://ens.domains/blog/post/ensip-25
- ENS + ERC-8004 identity problem: https://ens.domains/blog/post/ens-ai-agent-erc8004
- ENS-bound agents in production (dinamic.eth, record keys): https://discuss.ens.domains/t/ens-bound-agents-in-production-all-five-layers-live-a-proposal-for-the-path-forward/22113
- dinamic.eth live registry: https://dinamic.eth.limo

## MUST-VERIFY checklist
- [ ] Reputation Registry mainnet address on Etherscan UI (got it from official repo table only).
- [ ] Validation Registry mainnet address (NOT published; spec in flux).
- [ ] Exact ENSIP-26 text-record key spelling (`registrations[0]`, `agent-endpoint[...]`) — confirm at ENS stand.
- [ ] Gas numbers — simulate with viem estimateContractGas against the real contract.
