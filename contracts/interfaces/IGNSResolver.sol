// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IGNSResolver {
    event AddressChanged(bytes32 indexed node, address newAddress);
    event NameChanged(bytes32 indexed node, string name);
    event SetController(address newController);

    function controller() external view returns (address);

    function addr(bytes32 node) external view returns (address);

    function name(bytes32 reverseNode) external view returns (string memory);

    function setAddr(bytes32 node, address a) external;

    function setName(bytes32 reverseNode, string calldata _name) external;
}
