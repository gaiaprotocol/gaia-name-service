// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IGNS is IERC721 {
    event SetController(address newController);

    function GRACE_PERIOD() external view returns (uint256);

    function controller() external view returns (address);

    function expiries(uint256 id) external view returns (uint256);

    function available(uint256 id) external view returns (bool);

    function register(
        uint256 id,
        address owner,
        uint256 duration
    ) external returns (uint256);

    function renew(uint256 id, uint256 duration) external returns (uint256);
}
