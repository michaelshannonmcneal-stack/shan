// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * @title CarMarketplace
 * @notice P2P NFT marketplace for PINKS race cars.
 *         Fee: 3.5% (350/10000) of sale price → feeRecipient.
 *         Seller receives 96.5% of sale price.
 */
contract CarMarketplace is ReentrancyGuard, Ownable {

    uint256 public constant FEE_BPS   = 350;
    uint256 public constant BPS_DENOM = 10_000;

    struct Listing {
        address seller;
        uint256 price;
        bool    active;
    }

    IERC721 public carNFT;
    address public feeRecipient;

    mapping(uint256 => Listing) public listings;

    // ── Events ─────────────────────────────────────────────────────
    event Listed  (uint256 indexed tokenId, address indexed seller, uint256 price);
    event Delisted(uint256 indexed tokenId, address indexed seller);
    event Sold    (uint256 indexed tokenId, address indexed seller, address indexed buyer,
                   uint256 price, uint256 fee);

    // ── Constructor ────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address _carNFT,
        address _feeRecipient
    ) Ownable(initialOwner) {
        carNFT       = IERC721(_carNFT);
        feeRecipient = _feeRecipient;
    }

    // ── Seller ─────────────────────────────────────────────────────
    function list(uint256 tokenId, uint256 price) external {
        require(carNFT.ownerOf(tokenId) == msg.sender, "Not owner");
        require(
            carNFT.isApprovedForAll(msg.sender, address(this)) ||
            carNFT.getApproved(tokenId) == address(this),
            "Not approved"
        );
        require(price > 0, "Zero price");

        listings[tokenId] = Listing({seller: msg.sender, price: price, active: true});
        emit Listed(tokenId, msg.sender, price);
    }

    function delist(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        require(l.active, "Not listed");
        require(l.seller == msg.sender, "Not seller");
        l.active = false;
        emit Delisted(tokenId, msg.sender);
    }

    // ── Buyer ──────────────────────────────────────────────────────
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing storage l = listings[tokenId];
        require(l.active,              "Not listed");
        require(msg.value == l.price,  "Wrong price");
        require(l.seller != msg.sender,"Self-buy not allowed");

        address seller = l.seller;
        uint256 price  = l.price;
        l.active = false;   // effects before interactions

        uint256 fee    = (price * FEE_BPS) / BPS_DENOM;
        uint256 payout = price - fee;

        carNFT.transferFrom(seller, msg.sender, tokenId);

        (bool sellerOk,) = seller.call{value: payout}("");
        require(sellerOk, "Seller transfer failed");

        (bool feeOk,) = feeRecipient.call{value: fee}("");
        require(feeOk, "Fee transfer failed");

        emit Sold(tokenId, seller, msg.sender, price, fee);
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setFeeRecipient(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        feeRecipient = _new;
    }
}
