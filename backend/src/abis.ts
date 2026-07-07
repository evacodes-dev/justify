import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function registerCreator(address user) external",
  "function isCreator(address) external view returns (bool)",
  "function createMarket(address collateral, string question, string metadataURI, uint64 closeTime, uint256 initialLiquidity) external returns (uint256 id, address market)",
  "function markets(uint256) external view returns (address)",
  "function marketCount() external view returns (uint256)",
  "event MarketCreated(uint256 indexed id, address market, address indexed creator, string question, uint64 closeTime)",
  "event CreatorRegistered(address indexed user)",
]);

export const marketAbi = parseAbi([
  "function buy(uint8 outcome, uint256 amountIn) external returns (uint256 tokensOut)",
  "function redeem() external returns (uint256 payout)",
  "function addLiquidity(uint256 amount) external returns (uint256 shares)",
  "function priceYes() external view returns (uint256)",
  "function reserves() external view returns (uint256 yes, uint256 no)",
  "function resolved() external view returns (bool)",
  "function winningOutcome() external view returns (uint8)",
  "function resolutionReason() external view returns (string)",
  "function closeTime() external view returns (uint64)",
  "function question() external view returns (string)",
  "function metadataURI() external view returns (string)",
  "function collateral() external view returns (address)",
  "function creator() external view returns (address)",
  "function feePool() external view returns (uint256)",
  "function balances(address, uint8) external view returns (uint256)",
  "function previewPayout(address) external view returns (uint256)",
  "event Buy(address indexed user, uint8 outcome, uint256 amountIn, uint256 tokensOut, uint256 priceYesAfter)",
  "event Resolved(uint8 outcome, string reason)",
  "event Redeemed(address indexed user, uint256 payout)",
  "event LiquidityAdded(address indexed provider, uint256 amount, uint256 shares)",
  "event LiquidityRemoved(address indexed provider, uint256 shares, uint256 amount)",
]);

export const resolverAbi = parseAbi([
  "function resolve(uint256 marketId, uint8 outcome, string reason) external",
  "function setPriceFeed(uint256 marketId, address feed, int256 threshold, uint8 comparator, uint64 maxStale) external",
  "function resolveByPrice(uint256 marketId) external",
  "function priceFeeds(uint256) external view returns (address feed, int256 threshold, uint8 comparator, uint64 maxStale, bool set)",
  "event Resolved(uint256 indexed marketId, uint8 outcome, string reason)",
  "event PriceResolved(uint256 indexed marketId, address feed, int256 answer, int256 threshold, uint8 outcome)",
]);

// Chainlink AggregatorV3 (settlement chain) — used to scale thresholds to feed decimals.
export const aggregatorDecimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);

// OptimisticSettler — AI/CRE proposals with a public challenge window; UMA on dispute.
export const settlerAbi = parseAbi([
  "function propose(uint256 marketId, uint8 outcome, string reason) external",
  "function finalize(uint256 marketId) external",
  "function canFinalize(uint256 marketId) view returns (bool)",
  "function settleChallenge(uint256 marketId) external",
  "function proposals(uint256) view returns (uint8 outcome, uint8 counterOutcome, uint8 status, uint64 proposedAt, address proposer, address challenger, bytes32 assertionId, string reason)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
]);
