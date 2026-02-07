// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CircuitBreaker.sol";
import "./ConstraintStore.sol";

/**
 * ExecutionRouter
 * - Only callable by TransactionQueue (queue address) => bounded autonomy on-chain.
 * - Enforces hard constraints (e.g., slippage) regardless of what agents decide off-chain.
 * - Includes a demo integration point (MockDex) for REBALANCE/HEDGE.
 */
contract ExecutionRouter is CircuitBreaker {
    ConstraintStore public constraints;
    address public vault;
    address public queue;
    address public dex;

    enum ActionType { REBALANCE, HEDGE, REDEEM, PAUSE, UNPAUSE, UPDATE_CONSTRAINTS }

    event QueueSet(address indexed queue);
    event DexSet(address indexed dex);
    event Executed(ActionType indexed actionType, bytes params);
    event DexSwap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 amountOut);

    constructor(address owner_, address constraints_, address vault_) CircuitBreaker(owner_) {
        constraints = ConstraintStore(constraints_);
        vault = vault_;
    }

    modifier onlyQueue() {
        require(msg.sender == queue, "only queue");
        _;
    }

    function setQueue(address queue_) external onlyOwner {
        require(queue_ != address(0), "queue=0");
        queue = queue_;
        emit QueueSet(queue_);
    }

    function setDex(address dex_) external onlyOwner {
        dex = dex_;
        emit DexSet(dex_);
    }

    function emergencyPause() external onlyOwner { paused = true; }
    function emergencyUnpause() external onlyOwner { paused = false; }

    function execute(ActionType actionType, bytes calldata params) external whenNotPaused onlyQueue {
        if (params.length >= 32) {
            uint256 slippageBps = abi.decode(params, (uint256));
            require(slippageBps <= constraints.maxSlippageBps(), "slippage");
        }

        if (actionType == ActionType.PAUSE) {
            paused = true;
            emit Executed(actionType, params);
            return;
        }
        if (actionType == ActionType.UNPAUSE) {
            paused = false;
            emit Executed(actionType, params);
            return;
        }

        if ((actionType == ActionType.REBALANCE || actionType == ActionType.HEDGE) && dex != address(0) && params.length >= 32 * 5) {
            (uint256 slippageBps, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) =
                abi.decode(params, (uint256, address, address, uint256, uint256));
            uint256 amountOut = IMockDex(dex).swap(tokenIn, tokenOut, amountIn, minAmountOut);
            emit DexSwap(tokenIn, tokenOut, amountIn, minAmountOut, amountOut);
            emit Executed(actionType, abi.encode(slippageBps, tokenIn, tokenOut, amountIn, minAmountOut, amountOut));
            return;
        }

        emit Executed(actionType, params);
    }
}

interface IMockDex {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut);
}
