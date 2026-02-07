// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * MockDex
 * Minimal swap venue for demo/testing. Not a real AMM.
 */
contract MockDex {
    // Fixed output rate: 1:1 for demo.
    function swap(address /*tokenIn*/, address /*tokenOut*/, uint256 amountIn, uint256 minAmountOut) external pure returns (uint256 amountOut) {
        amountOut = amountIn;
        require(amountOut >= minAmountOut, "minOut");
        return amountOut;
    }
}
