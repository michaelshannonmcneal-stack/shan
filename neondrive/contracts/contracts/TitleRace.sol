// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * @title TitleRace
 * @notice "Racing for pinks" — winner takes both cars.
 *
 * Monetisation: flat entryFee per player (cannot skim 3.5% of an NFT).
 * Both entry fees → feeRecipient on settlement; refunded on cancel/timeout.
 *
 * Flow identical to RaceWager but escrowing NFTs instead of fungible AVAX.
 */
contract TitleRace is ReentrancyGuard, Ownable {

    uint256 public constant TIMEOUT_BLOCKS = 300;

    enum Status { Open, Joined, Settled, Cancelled }

    struct Race {
        address player1;
        address player2;
        uint256 car1Id;
        uint256 car2Id;
        uint256 joinedBlock;
        Status  status;
    }

    IERC721 public carNFT;
    address public resolver;
    address public feeRecipient;
    uint256 public entryFee;

    mapping(bytes32 => Race) public races;

    // ── Events ─────────────────────────────────────────────────────
    event TitleRaceCreated (bytes32 indexed raceId, address indexed player1, uint256 car1Id);
    event TitleRaceJoined  (bytes32 indexed raceId, address indexed player2, uint256 car2Id);
    event TitleRaceSettled (bytes32 indexed raceId, address indexed winner, uint256 wonCarId);
    event TitleRaceCancelled(bytes32 indexed raceId);
    event TitleRaceTimeout (bytes32 indexed raceId);

    // ── Constructor ────────────────────────────────────────────────
    constructor(
        address initialOwner,
        address _carNFT,
        address _resolver,
        address _feeRecipient,
        uint256 _entryFee
    ) Ownable(initialOwner) {
        carNFT       = IERC721(_carNFT);
        resolver     = _resolver;
        feeRecipient = _feeRecipient;
        entryFee     = _entryFee;
    }

    // ── Player 1 ───────────────────────────────────────────────────
    function createRace(bytes32 raceId, uint256 carId) external payable {
        require(races[raceId].player1 == address(0), "Race ID taken");
        require(msg.value == entryFee,               "Wrong entry fee");
        require(carNFT.ownerOf(carId) == msg.sender, "Not car owner");
        require(
            carNFT.isApprovedForAll(msg.sender, address(this)) ||
            carNFT.getApproved(carId) == address(this),
            "Car not approved"
        );

        carNFT.transferFrom(msg.sender, address(this), carId);

        races[raceId] = Race({
            player1:    msg.sender,
            player2:    address(0),
            car1Id:     carId,
            car2Id:     0,
            joinedBlock: 0,
            status:     Status.Open
        });
        emit TitleRaceCreated(raceId, msg.sender, carId);
    }

    // ── Player 2 ───────────────────────────────────────────────────
    function joinRace(bytes32 raceId, uint256 carId) external payable nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Open,             "Race not open");
        require(r.player1 != msg.sender,             "Cannot race yourself");
        require(msg.value == entryFee,               "Wrong entry fee");
        require(carNFT.ownerOf(carId) == msg.sender, "Not car owner");
        require(
            carNFT.isApprovedForAll(msg.sender, address(this)) ||
            carNFT.getApproved(carId) == address(this),
            "Car not approved"
        );

        carNFT.transferFrom(msg.sender, address(this), carId);

        r.player2    = msg.sender;
        r.car2Id     = carId;
        r.joinedBlock = block.number;
        r.status     = Status.Joined;
        emit TitleRaceJoined(raceId, msg.sender, carId);
    }

    // ── Resolver ───────────────────────────────────────────────────
    function settle(bytes32 raceId, address winner) external nonReentrant {
        require(msg.sender == resolver,    "Not resolver");
        Race storage r = races[raceId];
        require(r.status == Status.Joined, "Race not joined");
        require(winner == r.player1 || winner == r.player2, "Invalid winner");

        r.status = Status.Settled;

        uint256 winCar  = (winner == r.player1) ? r.car1Id : r.car2Id;
        uint256 loseCar = (winner == r.player1) ? r.car2Id : r.car1Id;

        carNFT.transferFrom(address(this), winner, winCar);
        carNFT.transferFrom(address(this), winner, loseCar);

        (bool ok,) = feeRecipient.call{value: entryFee * 2}("");
        require(ok, "Fee transfer failed");

        emit TitleRaceSettled(raceId, winner, loseCar);
    }

    // ── Cancel ─────────────────────────────────────────────────────
    function cancel(bytes32 raceId) external nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Open,  "Race not open");
        require(r.player1 == msg.sender,  "Not player 1");

        r.status = Status.Cancelled;
        carNFT.transferFrom(address(this), msg.sender, r.car1Id);
        (bool ok,) = msg.sender.call{value: entryFee}("");
        require(ok, "Refund failed");
        emit TitleRaceCancelled(raceId);
    }

    // ── Timeout ────────────────────────────────────────────────────
    function timeoutRefund(bytes32 raceId) external nonReentrant {
        Race storage r = races[raceId];
        require(r.status == Status.Joined, "Race not joined");
        require(block.number > r.joinedBlock + TIMEOUT_BLOCKS, "Not timed out yet");
        require(msg.sender == r.player1 || msg.sender == r.player2, "Not a player");

        r.status = Status.Cancelled;

        carNFT.transferFrom(address(this), r.player1, r.car1Id);
        carNFT.transferFrom(address(this), r.player2, r.car2Id);

        (bool p1ok,) = r.player1.call{value: entryFee}("");
        require(p1ok, "P1 refund failed");
        (bool p2ok,) = r.player2.call{value: entryFee}("");
        require(p2ok, "P2 refund failed");

        emit TitleRaceTimeout(raceId);
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setResolver(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        resolver = _new;
    }

    function setFeeRecipient(address _new) external onlyOwner {
        require(_new != address(0), "Zero address");
        feeRecipient = _new;
    }

    function setEntryFee(uint256 _new) external onlyOwner {
        entryFee = _new;
    }
}
