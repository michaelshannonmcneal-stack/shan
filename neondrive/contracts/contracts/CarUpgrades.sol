// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RaceCarNFT.sol";

/**
 * @title CarUpgrades
 * @notice ERC-1155 upgrade parts for PINKS race cars.
 *
 * 27 upgrade types are seeded by admin via createUpgrade().
 * Each type targets one of 5 stats (speed/handling/accel/durability/boost).
 * Cars have SLOT_COUNT (5) equipment slots.
 * Equipping burns 1 unit from inventory; unequipping returns 1 to inventory.
 */
contract CarUpgrades is ERC1155, Ownable, ReentrancyGuard {

    uint8 public constant SLOT_COUNT = 5;

    // ── Stat indices ───────────────────────────────────────────────
    uint8 public constant STAT_SPEED        = 0;
    uint8 public constant STAT_HANDLING     = 1;
    uint8 public constant STAT_ACCELERATION = 2;
    uint8 public constant STAT_DURABILITY   = 3;
    uint8 public constant STAT_BOOST        = 4;

    // ── Structs ────────────────────────────────────────────────────
    struct UpgradeType {
        string  name;
        uint8   statIndex;    // 0-4
        uint8   boostAmount;  // additive points
        uint256 price;        // in wei (AVAX)
        bool    exists;
    }

    // ── State ──────────────────────────────────────────────────────
    RaceCarNFT public carNFT;
    address    public feeRecipient;

    mapping(uint256 => UpgradeType)                   public upgradeTypes;
    mapping(uint256 => mapping(uint8 => uint256))     public equippedParts; // carId => slot => upgradeId

    uint256[] private _allUpgradeIds;

    // ── Events ─────────────────────────────────────────────────────
    event UpgradeCreated(uint256 indexed id, string name, uint8 stat, uint8 boost, uint256 price);
    event UpgradePurchased(address indexed buyer, uint256 indexed upgradeId, uint256 amount);
    event PartEquipped(uint256 indexed carId, uint8 slot, uint256 upgradeId);
    event PartUnequipped(uint256 indexed carId, uint8 slot, uint256 oldUpgradeId);

    // ── Constructor ────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address _carNFT,
        address _feeRecipient
    ) ERC1155("") Ownable(initialOwner) {
        carNFT       = RaceCarNFT(_carNFT);
        feeRecipient = _feeRecipient;
    }

    // ── Admin ──────────────────────────────────────────────────────
    function createUpgrade(
        uint256 id,
        string calldata name,
        uint8 statIndex,
        uint8 boostAmount,
        uint256 price
    ) external onlyOwner {
        require(!upgradeTypes[id].exists, "ID already exists");
        require(statIndex < 5, "Invalid stat index");
        upgradeTypes[id] = UpgradeType(name, statIndex, boostAmount, price, true);
        _allUpgradeIds.push(id);
        emit UpgradeCreated(id, name, statIndex, boostAmount, price);
    }

    // ── Purchase ───────────────────────────────────────────────────
    function buyUpgrade(uint256 upgradeId, uint256 amount) external payable nonReentrant {
        UpgradeType memory u = upgradeTypes[upgradeId];
        require(u.exists, "Unknown upgrade");
        require(amount > 0, "Zero amount");
        require(msg.value == u.price * amount, "Wrong AVAX amount");

        _mint(msg.sender, upgradeId, amount, "");

        (bool ok,) = feeRecipient.call{value: msg.value}("");
        require(ok, "Fee transfer failed");

        emit UpgradePurchased(msg.sender, upgradeId, amount);
    }

    // ── Equip / Unequip ────────────────────────────────────────────
    function equip(uint256 carId, uint256 upgradeId, uint8 slot) external {
        require(carNFT.ownerOf(carId) == msg.sender, "Not car owner");
        require(upgradeTypes[upgradeId].exists, "Unknown upgrade");
        require(slot < SLOT_COUNT, "Invalid slot");
        require(balanceOf(msg.sender, upgradeId) > 0, "Don't own upgrade");

        uint256 existing = equippedParts[carId][slot];
        if (existing != 0) {
            _mint(msg.sender, existing, 1, "");
            emit PartUnequipped(carId, slot, existing);
        }

        _burn(msg.sender, upgradeId, 1);
        equippedParts[carId][slot] = upgradeId;
        emit PartEquipped(carId, slot, upgradeId);
    }

    function unequip(uint256 carId, uint8 slot) external {
        require(carNFT.ownerOf(carId) == msg.sender, "Not car owner");
        require(slot < SLOT_COUNT, "Invalid slot");
        uint256 equipped = equippedParts[carId][slot];
        require(equipped != 0, "Slot empty");

        equippedParts[carId][slot] = 0;
        _mint(msg.sender, equipped, 1, "");
        emit PartUnequipped(carId, slot, equipped);
    }

    // ── View ───────────────────────────────────────────────────────
    function getEffectiveStats(uint256 carId)
        external view
        returns (uint8[5] memory stats)
    {
        (uint8 speed, uint8 handling, uint8 acceleration, uint8 durability, uint8 boost,) =
            carNFT.carStats(carId);
        stats = [speed, handling, acceleration, durability, boost];

        for (uint8 slot = 0; slot < SLOT_COUNT; slot++) {
            uint256 partId = equippedParts[carId][slot];
            if (partId == 0) continue;
            UpgradeType memory u = upgradeTypes[partId];
            uint8 cur = stats[u.statIndex];
            uint16 boosted = uint16(cur) + uint16(u.boostAmount);
            stats[u.statIndex] = boosted > 100 ? 100 : uint8(boosted);
        }
    }

    function getEquipped(uint256 carId) external view returns (uint256[5] memory parts) {
        for (uint8 i = 0; i < SLOT_COUNT; i++) parts[i] = equippedParts[carId][i];
    }

    function allUpgradeIds() external view returns (uint256[] memory) {
        return _allUpgradeIds;
    }
}
