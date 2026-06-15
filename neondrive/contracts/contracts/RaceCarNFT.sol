// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RaceCarNFT
 * @notice ERC-721 race car NFT with on-chain stats.
 *
 * Mint rules:
 *  - Public mint: MINT_PRICE AVAX, MAX_PER_WALLET cap per address.
 *  - ownerMint: admin only, no price, no cap — used for seeding.
 *
 * @dev VRF: stat randomness is STUBBED — replace with Chainlink VRF v2.5.
 *      TODO VRF integration steps:
 *        1. Inherit VRFConsumerBaseV2Plus
 *        2. Fund a VRF subscription at vrf.chain.link
 *        3. Replace _deriveStats pseudo-random call with requestRandomWords()
 *        4. Implement fulfillRandomWords() to store pending mint stats
 *        5. Emit CarMinted from fulfillRandomWords callback
 *      Until then this contract uses block data — miner-manipulable on L1,
 *      acceptable risk on Avalanche with its fast finality for a prototype.
 */
contract RaceCarNFT is ERC721URIStorage, Ownable, ReentrancyGuard {

    // ── Constants ──────────────────────────────────────────────────
    uint256 public constant MINT_PRICE     = 0.5 ether;   // 0.5 AVAX
    uint256 public constant MAX_PER_WALLET = 3;
    uint256 public constant MAX_SUPPLY     = 1_000;

    // ── Rarity indices ─────────────────────────────────────────────
    uint8 public constant COMMON    = 0;
    uint8 public constant UNCOMMON  = 1;
    uint8 public constant RARE      = 2;
    uint8 public constant EPIC      = 3;
    uint8 public constant LEGENDARY = 4;

    // ── Structs ────────────────────────────────────────────────────
    struct CarStats {
        uint8 speed;
        uint8 handling;
        uint8 acceleration;
        uint8 durability;
        uint8 boost;
        uint8 rarity;   // 0-4
    }

    // ── State ──────────────────────────────────────────────────────
    mapping(uint256 => CarStats) public carStats;
    mapping(address => uint256)  public mintCount;

    uint256 private _nextTokenId;
    string  private _baseMetadataURI;
    address public  feeRecipient;

    // ── Events ─────────────────────────────────────────────────────
    event CarMinted(address indexed to, uint256 indexed tokenId, CarStats stats);

    // ── Constructor ────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address _feeRecipient,
        string memory baseURI
    ) ERC721("PINKS NeonDrive Car", "PNDC") Ownable(initialOwner) {
        feeRecipient     = _feeRecipient;
        _baseMetadataURI = baseURI;
    }

    // ── Public mint ────────────────────────────────────────────────
    function mint(uint256 quantity) external payable nonReentrant {
        require(quantity > 0 && quantity <= MAX_PER_WALLET, "Invalid qty");
        require(mintCount[msg.sender] + quantity <= MAX_PER_WALLET, "Wallet cap exceeded");
        require(_nextTokenId + quantity <= MAX_SUPPLY, "Max supply reached");
        require(msg.value == MINT_PRICE * quantity, "Wrong AVAX amount");

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = ++_nextTokenId;
            mintCount[msg.sender]++;

            CarStats memory stats = _deriveStats(tokenId, msg.sender, block.timestamp + i);
            carStats[tokenId] = stats;

            string memory uri = string(abi.encodePacked(
                _baseMetadataURI, _toString(tokenId), ".json"
            ));
            _safeMint(msg.sender, tokenId);
            _setTokenURI(tokenId, uri);

            emit CarMinted(msg.sender, tokenId, stats);
        }

        (bool ok,) = feeRecipient.call{value: msg.value}("");
        require(ok, "Fee transfer failed");
    }

    /**
     * @notice Admin mint — seeds collection with named cars.
     */
    function ownerMint(
        address to,
        CarStats calldata stats,
        string calldata uri
    ) external onlyOwner {
        require(_nextTokenId < MAX_SUPPLY, "Max supply reached");
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        carStats[tokenId] = stats;
        _setTokenURI(tokenId, uri);
        emit CarMinted(to, tokenId, stats);
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setFeeRecipient(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        feeRecipient = _new;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseMetadataURI = uri;
    }

    // ── View ───────────────────────────────────────────────────────
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // ── Internal ───────────────────────────────────────────────────
    /// @dev Pseudo-random stat derivation — REPLACE WITH VRF.
    function _deriveStats(
        uint256 tokenId,
        address minter,
        uint256 salt
    ) internal pure returns (CarStats memory) {
        bytes32 h = keccak256(abi.encodePacked(tokenId, minter, salt));
        uint8 r   = uint8(uint256(h) % 5);
        uint8 base   = 30 + r * 12;
        uint8 spread = 20;

        return CarStats({
            speed:        base + uint8(uint256(keccak256(abi.encodePacked(h, "s"))) % spread),
            handling:     base + uint8(uint256(keccak256(abi.encodePacked(h, "h"))) % spread),
            acceleration: base + uint8(uint256(keccak256(abi.encodePacked(h, "a"))) % spread),
            durability:   base + uint8(uint256(keccak256(abi.encodePacked(h, "d"))) % spread),
            boost:        base + uint8(uint256(keccak256(abi.encodePacked(h, "b"))) % spread),
            rarity:       r
        });
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
