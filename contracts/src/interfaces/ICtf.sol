// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice 0.8 interfaces to the AUDITED Gnosis stack vendored under contracts/vendor/
/// (verbatim solc-0.5.16 sources — see vendor/PROVENANCE.md). All money custody and
/// settlement math live in those audited contracts; our code only talks to them here.

/// Gnosis ConditionalTokens (ERC-1155 singleton escrow).
interface ICtf {
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;
    /// called by the condition's oracle; payout numerators per outcome slot (e.g. [0,1] = YES)
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;
    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external;

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        external
        pure
        returns (bytes32);
    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        external
        view
        returns (bytes32);
    function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint256);

    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);

    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function setApprovalForAll(address operator, bool approved) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
}

/// Gnosis FixedProductMarketMaker (audited CPMM; fee is a fraction of 1e18).
interface IFpmm {
    function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy) external;
    function sell(uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell) external;
    function calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex) external view returns (uint256);
    function calcSellAmount(uint256 returnAmount, uint256 outcomeIndex) external view returns (uint256);
    function addFunding(uint256 addedFunds, uint256[] calldata distributionHint) external;
    function removeFunding(uint256 sharesToBurn) external;
    function collectedFees() external view returns (uint256);
    function withdrawFees(address account) external;
    // LP shares are the FPMM's own ERC-20
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function totalSupply() external view returns (uint256);
}

/// Gnosis FPMMDeterministicFactory. Pulls `initialFunds` from msg.sender and returns the
/// minted LP tokens to msg.sender.
interface IFpmmFactory {
    function create2FixedProductMarketMaker(
        uint256 saltNonce,
        address conditionalTokens,
        address collateralToken,
        bytes32[] calldata conditionIds,
        uint256 fee,
        uint256 initialFunds,
        uint256[] calldata distributionHint
    ) external returns (address);
}
