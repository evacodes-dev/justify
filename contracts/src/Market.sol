// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Market — binary FPMM prediction market (Gnosis-style constant product).
/// @notice Outcomes: 0 = NO, 1 = YES, 2 = INVALID (resolution only).
///
/// All internal accounting is in the collateral token's native units (USDC = 6 decimals).
/// 1 winning-outcome share redeems for exactly 1 collateral unit. `priceYes()` is scaled to 1e18.
///
/// Conditional settlement (Arc "advanced stablecoin logic"): collateral is LOCKED in this
/// contract on every buy/liquidity action and is only RELEASED — automatically conditioned on
/// the resolved outcome — through `redeem()` (winners) and `removeLiquidity()` (LPs). No admin
/// withdrawal path exists; settlement is purely a function of the on-chain resolution.
contract Market is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────── config (immutable) ─────────────────────────
    address public immutable factory;
    address public immutable resolver; // the Resolver contract — only caller allowed to resolve()
    address public immutable creator;
    IERC20 public immutable collateral;
    uint16 public immutable feeBps; // e.g. 200 = 2%
    uint64 public immutable closeTime;
    /// @notice If the oracle never resolves, anyone may force INVALID after this grace period
    /// past closeTime — funds can never be locked forever.
    uint64 public constant RESOLVE_GRACE = 30 days;
    string public question;
    string public metadataURI; // topic/category/image — read by the backend (NOT for LLM default)

    // ───────────────────────── state ─────────────────────────
    bool public resolved;
    uint8 public winningOutcome; // 0 = NO, 1 = YES, 2 = INVALID
    string public resolutionReason; // on-chain justification (CRE/LLM)

    uint256 public reserveYes;
    uint256 public reserveNo;
    uint256 public totalLiquidityShares;
    uint256 public feePool; // accrued fees for LPs

    mapping(address => mapping(uint8 => uint256)) public balances; // user => outcome => shares
    mapping(uint8 => uint256) public totalOutcomeShares; // outstanding shares per outcome
    mapping(address => uint256) public lpShares;

    // ───────────────────────── events (read by the backend indexer) ─────────────────────────
    event Buy(address indexed user, uint8 outcome, uint256 amountIn, uint256 tokensOut, uint256 priceYesAfter);
    event Sell(address indexed user, uint8 outcome, uint256 sharesIn, uint256 amountOut, uint256 priceYesAfter);
    event Resolved(uint8 outcome, string reason);
    event Redeemed(address indexed user, uint256 payout);
    event LiquidityAdded(address indexed provider, uint256 amount, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 shares, uint256 amount);

    constructor(
        address _creator,
        address _resolver,
        IERC20 _collateral,
        string memory _question,
        string memory _metadataURI,
        uint64 _closeTime,
        uint16 _feeBps,
        uint256 initialLiquidity
    ) {
        require(initialLiquidity > 0, "L=0");
        require(_closeTime > block.timestamp, "closeTime");
        require(_feeBps <= 1000, "fee");
        require(_resolver != address(0) && _creator != address(0), "zero");
        factory = msg.sender; // factory funds this market with `initialLiquidity` right after deploy
        creator = _creator;
        resolver = _resolver;
        collateral = _collateral;
        question = _question;
        metadataURI = _metadataURI;
        closeTime = _closeTime;
        feeBps = _feeBps;

        // CPMM init: equal reserves both sides → priceYes starts at 0.5. k = reserveYes * reserveNo.
        reserveYes = initialLiquidity;
        reserveNo = initialLiquidity;
        totalLiquidityShares = initialLiquidity;
        lpShares[_creator] = initialLiquidity;
        emit LiquidityAdded(_creator, initialLiquidity, initialLiquidity);
    }

    // ───────────────────────── trading ─────────────────────────

    /// @notice Buy `outcome` shares with `amountIn` collateral. approve() this market first.
    /// @dev Legacy overload without slippage bound (kept for ABI compatibility). Prefer the
    /// 3-arg overload with `minTokensOut` — on mainnet the price can move between quote and
    /// inclusion, and this variant accepts whatever the pool gives.
    function buy(uint8 outcome, uint256 amountIn) external nonReentrant returns (uint256 tokensOut) {
        return _buy(outcome, amountIn, 0);
    }

    /// @notice Buy with slippage protection: reverts unless at least `minTokensOut` shares out.
    function buy(uint8 outcome, uint256 amountIn, uint256 minTokensOut)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        return _buy(outcome, amountIn, minTokensOut);
    }

    function _buy(uint8 outcome, uint256 amountIn, uint256 minTokensOut) internal returns (uint256 tokensOut) {
        require(!resolved, "resolved");
        require(block.timestamp < closeTime, "closed");
        require(outcome < 2, "outcome");
        require(amountIn > 0, "amount");

        uint256 fee = (amountIn * feeBps) / 10_000;
        uint256 a = amountIn - fee;
        feePool += fee;

        uint256 reserveIn = outcome == 1 ? reserveYes : reserveNo;
        uint256 reserveOut = outcome == 1 ? reserveNo : reserveYes;
        // constant-product: add `a` to both virtual sides, withdraw the bought side.
        // Round the post-trade bought reserve UP (ceil) so rounding always favours the pool/LPs
        // and k = reserveYes*reserveNo never decreases (trader gets the floored tokensOut).
        uint256 denom = reserveOut + a;
        uint256 endingIn = (reserveIn * reserveOut + denom - 1) / denom; // ceil
        tokensOut = reserveIn + a - endingIn;
        require(tokensOut >= minTokensOut, "slippage");

        if (outcome == 1) {
            reserveYes = endingIn;
            reserveNo = denom;
        } else {
            reserveNo = endingIn;
            reserveYes = denom;
        }

        balances[msg.sender][outcome] += tokensOut;
        totalOutcomeShares[outcome] += tokensOut;

        collateral.safeTransferFrom(msg.sender, address(this), amountIn);
        emit Buy(msg.sender, outcome, amountIn, tokensOut, priceYes());
    }

    /// @dev Sell (return shares for collateral) is a planned extension. Buy already gives a live
    /// price, which is the priority. TODO: implement calcSellAmount (quadratic) + Sell event.

    // ───────────────────────── pricing ─────────────────────────

    /// @notice Marginal YES probability, scaled to 1e18 (0..1e18).
    function priceYes() public view returns (uint256) {
        uint256 t = reserveYes + reserveNo;
        return t == 0 ? 5e17 : (reserveNo * 1e18) / t;
    }

    // ───────────────────────── resolution ─────────────────────────

    /// @notice Resolve the market. Only the Resolver contract may call this (oracle = backend).
    /// @param reason on-chain justification (CRE simulation / LLM verdict).
    function resolve(uint8 outcome, string calldata reason) external {
        require(msg.sender == resolver, "onlyResolver");
        require(block.timestamp >= closeTime, "tooEarly");
        require(!resolved, "resolved");
        require(outcome <= 2, "outcome");
        winningOutcome = outcome;
        resolved = true;
        resolutionReason = reason;
        emit Resolved(outcome, reason);
    }

    /// @notice Safety net for prod: if the oracle never resolves (backend/keeper failure), ANYONE
    /// can force the market to INVALID once `RESOLVE_GRACE` has elapsed past closeTime. Settles via
    /// the same INVALID path (YES+NO refund at 0.5 each), so collateral is never permanently locked.
    function forceResolveInvalid() external {
        require(!resolved, "resolved");
        require(block.timestamp >= closeTime + RESOLVE_GRACE, "grace");
        winningOutcome = 2;
        resolved = true;
        resolutionReason = "auto-invalid: oracle did not resolve within grace period";
        emit Resolved(2, resolutionReason);
    }

    // ───────────────────────── settlement ─────────────────────────

    /// @notice Winners redeem winning shares 1:1 for collateral. INVALID refunds YES+NO at 0.5 each.
    function redeem() external nonReentrant returns (uint256 payout) {
        require(resolved, "!resolved");
        if (winningOutcome == 2) {
            uint256 y = balances[msg.sender][1];
            uint256 n = balances[msg.sender][0];
            require(y + n > 0, "nothing");
            balances[msg.sender][1] = 0;
            balances[msg.sender][0] = 0;
            totalOutcomeShares[1] -= y;
            totalOutcomeShares[0] -= n;
            payout = (y + n) / 2;
        } else {
            uint8 w = winningOutcome;
            uint256 amt = balances[msg.sender][w];
            require(amt > 0, "nothing");
            balances[msg.sender][w] = 0;
            totalOutcomeShares[w] -= amt;
            payout = amt; // 1 winning share = 1 collateral unit
        }
        collateral.safeTransfer(msg.sender, payout);
        emit Redeemed(msg.sender, payout);
    }

    // ───────────────────────── liquidity ─────────────────────────

    /// @notice Add collateral as liquidity (price-preserving: split across reserves by current ratio).
    function addLiquidity(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(!resolved, "resolved");
        require(block.timestamp < closeTime, "closed");
        require(amount > 0, "amount");
        uint256 poolValue = reserveYes + reserveNo;
        shares = (amount * totalLiquidityShares) / poolValue;
        uint256 addYes = (amount * reserveYes) / poolValue;
        uint256 addNo = amount - addYes;
        reserveYes += addYes;
        reserveNo += addNo;
        lpShares[msg.sender] += shares;
        totalLiquidityShares += shares;
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(msg.sender, amount, shares);
    }

    /// @notice Remove liquidity after resolution: proportional share of the collateral NOT owed to
    /// winners (principal + accrued fees). As winners redeem, balance and obligation fall together,
    /// so the LP pool stays solvent and stable.
    function removeLiquidity() external nonReentrant returns (uint256 amount) {
        require(resolved, "!resolved");
        uint256 s = lpShares[msg.sender];
        require(s > 0, "noLP");
        uint256 bal = collateral.balanceOf(address(this));
        uint256 obligation = _winnerObligation();
        uint256 lpPool = bal > obligation ? bal - obligation : 0;
        amount = (lpPool * s) / totalLiquidityShares;
        lpShares[msg.sender] = 0;
        totalLiquidityShares -= s;
        if (amount > 0) collateral.safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(msg.sender, s, amount);
    }

    /// @dev Collateral still owed to unredeemed winners.
    function _winnerObligation() internal view returns (uint256) {
        if (!resolved) return 0;
        if (winningOutcome == 2) return (totalOutcomeShares[0] + totalOutcomeShares[1]) / 2;
        return totalOutcomeShares[winningOutcome];
    }

    // ───────────────────────── views ─────────────────────────

    function reserves() external view returns (uint256 yes, uint256 no) {
        return (reserveYes, reserveNo);
    }

    function previewPayout(address user) external view returns (uint256) {
        if (!resolved) return 0;
        if (winningOutcome == 2) return (balances[user][0] + balances[user][1]) / 2;
        return balances[user][winningOutcome];
    }
}
