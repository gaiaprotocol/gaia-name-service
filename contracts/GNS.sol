// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/IGNS.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GNS is IGNS, ERC721, Ownable {
    uint256 public constant GRACE_PERIOD = 90 days;

    mapping(uint256 => uint256) public expiries;
    address public controller;

    constructor(address _controller) ERC721("GaiaNameService", "GNS") {
        _setController(_controller);
    }

    modifier onlyController() {
        require(msg.sender == controller, "NOT_FROM_CONTROLLER");
        _;
    }

    function setController(address _controller) external onlyOwner {
        _setController(_controller);
    }

    function _setController(address _controller) internal {
        require(controller != _controller, "UNCHANGED");
        controller = _controller;
        emit SetController(_controller);
    }

    function ownerOf(uint256 tokenId) public view override(ERC721, IERC721) returns (address) {
        require(expiries[tokenId] > block.timestamp, "INVALID_ID");
        return super.ownerOf(tokenId);
    }

    function available(uint256 id) public view returns (bool) {
        return expiries[id] + GRACE_PERIOD < block.timestamp;
    }

    /**
     * @dev Register a name.
     * @param id The token ID (keccak256 of the label).
     * @param owner The address that should own the registration.
     * @param duration Duration in seconds for the registration.
     */
    function register(
        uint256 id,
        address owner,
        uint256 duration
    ) external onlyController returns (uint256) {
        require(available(id), "UNEXPIRED_ID");

        expiries[id] = block.timestamp + duration;
        if (_exists(id)) {
            // Name was previously owned, and expired
            _burn(id);
        }
        _mint(owner, id);
        return block.timestamp + duration;
    }

    function renew(uint256 id, uint256 duration) external onlyController returns (uint256) {
        require(!available(id), "EXPIRED_ID");
        expiries[id] += duration;
        return expiries[id];
    }
}
