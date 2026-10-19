// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract GuessTheNumber is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ScoreEntry {
        address player;
        uint256 guessCount;
        uint256 timestamp;
    }

    event ScoreMinted(address indexed player, uint256 guessCount, uint256 timestamp);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event Withdrawn(address indexed owner, uint256 amount);
    event GameServerUpdated(address indexed oldServer, address indexed newServer);

    IERC20 public immutable usdcToken;
    uint256 private _entryFee;
    address public gameServer;

    ScoreEntry[] private _leaderboard;
    mapping(address => uint256) private _playerBestScore;
    mapping(address => uint256) private _nonce;

    constructor(address usdcToken_, uint256 entryFee_, address initialOwner, address gameServer_) Ownable(initialOwner) {
        require(usdcToken_ != address(0), "Invalid USDC token");
        require(initialOwner != address(0), "Invalid owner");
        require(entryFee_ > 0, "Entry fee must be > 0");
        require(gameServer_ != address(0), "Invalid game server");

        usdcToken = IERC20(usdcToken_);
        _entryFee = entryFee_;
        gameServer = gameServer_;
    }

    function mintScore(uint256 guessCount, bytes calldata sig) external nonReentrant {
        require(guessCount > 0, "Guess count must be > 0");

        bytes32 messageHash = keccak256(abi.encodePacked(address(this), msg.sender, guessCount, _nonce[msg.sender]));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, sig);
        require(recoveredSigner == gameServer, "Invalid server signature");

        unchecked {
            _nonce[msg.sender]++;
        }

        usdcToken.safeTransferFrom(msg.sender, address(this), _entryFee);

        uint256 timestamp = block.timestamp;
        _insertScore(msg.sender, guessCount, timestamp);

        uint256 currentBest = _playerBestScore[msg.sender];
        if (currentBest == 0 || guessCount < currentBest) {
            _playerBestScore[msg.sender] = guessCount;
        }

        emit ScoreMinted(msg.sender, guessCount, timestamp);
    }

    function getLeaderboard() external view returns (ScoreEntry[] memory) {
        return _leaderboard;
    }

    function getPlayerBestScore(address player) external view returns (uint256) {
        return _playerBestScore[player];
    }

    function getPlayerNonce(address player) external view returns (uint256) {
        return _nonce[player];
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No funds");

        usdcToken.safeTransfer(owner(), balance);
        emit Withdrawn(owner(), balance);
    }

    function setEntryFee(uint256 newFee) external onlyOwner {
        require(newFee > 0, "Entry fee must be > 0");

        uint256 oldFee = _entryFee;
        _entryFee = newFee;

        emit EntryFeeUpdated(oldFee, newFee);
    }

    function setGameServer(address newGameServer) external onlyOwner {
        require(newGameServer != address(0), "Invalid game server");
        address oldServer = gameServer;
        gameServer = newGameServer;
        emit GameServerUpdated(oldServer, newGameServer);
    }

    function getEntryFee() external view returns (uint256) {
        return _entryFee;
    }

    function _insertScore(address player, uint256 guessCount, uint256 timestamp) private {
        ScoreEntry memory newEntry = ScoreEntry({player: player, guessCount: guessCount, timestamp: timestamp});
        uint256 length = _leaderboard.length;

        if (length == 0) {
            _leaderboard.push(newEntry);
            return;
        }

        if (length < 10) {
            _leaderboard.push(newEntry);
            _bubbleUp(length);
            return;
        }

        if (guessCount >= _leaderboard[length - 1].guessCount) {
            return;
        }

        _leaderboard[length - 1] = newEntry;
        _bubbleUp(length - 1);
    }

    function _bubbleUp(uint256 index) private {
        while (index > 0 && _leaderboard[index].guessCount < _leaderboard[index - 1].guessCount) {
            ScoreEntry memory temp = _leaderboard[index - 1];
            _leaderboard[index - 1] = _leaderboard[index];
            _leaderboard[index] = temp;
            unchecked {
                index--;
            }
        }
    }
}
