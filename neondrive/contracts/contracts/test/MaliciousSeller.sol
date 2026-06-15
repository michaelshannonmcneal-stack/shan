// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../CarMarketplace.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title MaliciousSeller
 * @notice Test helper that attempts reentrancy on CarMarketplace.buy().
 *         Deployed and used only in the test suite.
 */
contract MaliciousSeller is IERC721Receiver {
    CarMarketplace public marketplace;
    uint256        public targetTokenId;
    uint256        public attackCount;
    bool           public attacking;

    constructor(address _marketplace) {
        marketplace = CarMarketplace(_marketplace);
    }

    /// @notice Approve the marketplace to transfer a token owned by this contract.
    function approveMarketplace(address carNFT, uint256 tokenId) external {
        IERC721(carNFT).approve(address(marketplace), tokenId);
    }

    /// @notice List a token at the given price via the marketplace.
    function listCar(uint256 tokenId, uint256 price) external {
        targetTokenId = tokenId;
        marketplace.list(tokenId, price);
    }

    /// @notice When this contract receives ETH (from the marketplace seller payout),
    ///         it attempts to re-enter buy() on the same token.
    receive() external payable {
        if (!attacking && address(marketplace).balance >= msg.value) {
            attacking = true;
            attackCount++;
            // This re-entrant call MUST fail due to ReentrancyGuard
            try marketplace.buy{value: msg.value}(targetTokenId) {} catch {}
            attacking = false;
        }
    }

    function withdrawAll() external {
        payable(msg.sender).transfer(address(this).balance);
    }

    /// @notice Required by IERC721Receiver so _safeMint to this contract works.
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
