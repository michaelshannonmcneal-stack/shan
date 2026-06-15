// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RaceWager
 * @notice AVAX escrow for 1v1 race wagers.
 *
 * Flow:
 *   1. player1 createRace(id) — escrows wager
 *   2. player2 joinRace(id)   — escrows same amount; timeout clock starts
 *   3. resolver settle(id, winner) — winner gets (2×wager × 96.5%), fee 3.5%
 *   4. Fallback: timeoutRefund(id) after TIMEOUT_BLOCKS — full refund both
 *   5. Before join: player1 cancel(id) — full refund
 */
contract RaceWager is ReentrancyGuard, Ownable {

    uint256 public constant FEE_BPS        = 350;
    uint256 public constant BPS_DENOM      = 10_000;
    uint256 public constant TIMEOUT_BLOCKS = 300;   // ~15 min at 3 s/block

    enum Status { Open, Joined, Settled, Cancelled }

    struct Race {
        address player1;
        address player2;
        uint256 wager;
        uint256 joinedBlock;
        Status  status;
    }

    mapping(bytes32 => Race) public races;

    address public resolver;
    address public feeRecipient;

    // ── Events ─────────────────────────────────────────────────────
    event RaceCreated  (bytes32 indexed raceId, address indexed player1, uint256 wager);
    event RaceJoined   (bytes32 indexed raceId, address indexed player2);
    event RaceSettled  (bytes32 indexed raceId, address indexed winner, uint256 payout, uint256 fee);
    event RaceCancelled(bytes32 indexed raceId);
    event RaceTimeout  (bytes32 indexed raceId);
    event ResolverSet  (address indexed resolver);

    // ── Constructor ────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address _resolver,
        address _feeRecipient
    ) Ownable(initialOwner) {
        resolver     = _resolver;
        feeRecipient = _feeRecipient;
    }

    // ── Player 1 ───────────────────────────────────────────────────
    function createRace(bytes32 raceId) external payable {
        require(races[raceId].player1 == address(0), "Race ID taken");
        require(msg.value > 0, "Zero wager");

        races[raceId] = Race({
            player1:    msg.sender,
            player2:    address(0),
            wager:      msg.value,
            joinedBlock: 0,
            status:     Status.Open
        });
        emit RaceCreated(raceId, msg.sender, msg.value);
    }

    // ── Player 2 ───────────────────────────────────────────────────
    function joinRace(bytes32 raceId) external payable nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Open,        "Race not open");
        require(r.player1 != msg.sender,        "Cannot race yourself");
        require(msg.value == r.wager,           "Wrong wager amount");

        r.player2    = msg.sender;
        r.joinedBlock = block.number;
        r.status     = Status.Joined;
        emit RaceJoined(raceId, msg.sender);
    }

    // ── Resolver ───────────────────────────────────────────────────
    function settle(bytes32 raceId, address winner) external nonReentrant {
        require(msg.sender == resolver, "Not resolver");
        Race storage r = races[raceId];
        require(r.status == Status.Joined, "Race not joined");
        require(winner == r.player1 || winner == r.player2, "Invalid winner");

        r.status = Status.Settled;

        uint256 pot    = r.wager * 2;
        uint256 fee    = (pot * FEE_BPS) / BPS_DENOM;
        uint256 payout = pot - fee;

        (bool wOk,) = winner.call{value: payout}("");
        require(wOk, "Winner transfer failed");

        (bool fOk,) = feeRecipient.call{value: fee}("");
        require(fOk, "Fee transfer failed");

        emit RaceSettled(raceId, winner, payout, fee);
    }

    // ── Cancel (open only) ─────────────────────────────────────────
    function cancel(bytes32 raceId) external nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Open,   "Race not open");
        require(r.player1 == msg.sender,   "Not player 1");

        r.status = Status.Cancelled;
        (bool ok,) = msg.sender.call{value: r.wager}("");
        require(ok, "Refund failed");
        emit RaceCancelled(raceId);
    }

    // ── Timeout refund ─────────────────────────────────────────────
    function timeoutRefund(bytes32 raceId) external nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Joined, "Race not joined");
        require(block.number > r.joinedBlock + TIMEOUT_BLOCKS, "Not timed out yet");
        require(msg.sender == r.player1 || msg.sender == r.player2, "Not a player");

        r.status = Status.Cancelled;

        (bool p1ok,) = r.player1.call{value: r.wager}("");
        require(p1ok, "P1 refund failed");
        (bool p2ok,) = r.player2.call{value: r.wager}("");
        require(p2ok, "P2 refund failed");

        emit RaceTimeout(raceId);
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setResolver(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        resolver = _new;
        emit ResolverSet(_new);
    }

    function setFeeRecipient(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        feeRecipient = _new;
    }
}
