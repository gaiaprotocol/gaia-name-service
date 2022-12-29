// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./IGNS.sol";
import "./IGNSResolver.sol";

interface IGNSController {
    event NameRegistered(
        string name,
        bytes32 indexed labelHash,
        address indexed nameOwner,
        address indexed token,
        uint256 price,
        uint256 expires
    );
    event NameRenewed(string name, bytes32 indexed labelHash, address indexed token, uint256 price, uint256 expires);
    event UpdateDomainManager(bytes32 indexed node, address indexed manager);
    event SetResolver(IGNSResolver newResolver);
    event SetOracle(address newOracle);
    event SetTreasury(address newTreasury);

    function BASE_NODE() external view returns (bytes32);

    function ADDR_REVERSE_NODE() external view returns (bytes32);

    function MIN_REGISTRATION_DURATION() external view returns (uint256);

    function gns() external view returns (IGNS);

    function resolver() external view returns (IGNSResolver);

    function oracle() external view returns (address);

    function treasury() external view returns (address);

    function domainManagers(bytes32 node) external view returns (address);

    function usedKeys(uint256 key) external view returns (bool);

    function valid(string calldata name) external pure returns (bool);

    function available(string calldata name) external view returns (bool);

    function getLabelHash(string calldata label) external pure returns (bytes32);

    function getNode(bytes32 labelHash) external pure returns (bytes32);

    function getReverseNode(address addr) external pure returns (bytes32);

    function register(
        string calldata name,
        address nameOwner,
        address domainManager,
        uint256 duration,
        bytes calldata data,
        bytes32 r,
        bytes32 vs
    ) external;

    function renew(
        string calldata name,
        uint256 duration,
        bytes calldata data,
        bytes32 r,
        bytes32 vs
    ) external;

    function updateDomainManager(bytes32 node, address addr) external;

    function setAddr(bytes32 node, address addr) external;

    function setName(string calldata name) external;
}
