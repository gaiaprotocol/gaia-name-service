// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IGNSResolver {
    error InvalidCaller();
    error UnchangedData();

    /**
     * e.g.
     * AddressChanged(namehash("thegreathb.gaia"), 0x1234....abcd)
     */
    event AddressChanged(bytes32 indexed node, address newAddress);

    /**
     * e.g.
     * NameChanged(namehash("1234....abcd.addr.reverse"), "thegreathb.gaia")
     */
    event NameChanged(bytes32 indexed node, string name);
    event SetController(address newController);

    function controller() external view returns (address);

    /**
     * e.g.
     * node : namehash("thegreathb.gaia")
     * return : 0x1234....abcd
     */
    function addr(bytes32 node) external view returns (address);

    /**
     * e.g.
     * node : namehash("1234....abcd.addr.reverse")
     * return : "thegreathb.gaia"
     */
    function name(bytes32 reverseNode) external view returns (string memory);

    /**
     * e.g.
     * node : namehash("thegreathb.gaia")
     * a : 0x1234....abcd
     */
    function setAddr(bytes32 node, address a) external;

    /**
     * e.g.
     * reverseNode : namehash("1234....abcd.addr.reverse")
     * _name : "thegreathb.gaia"
     */
    function setName(bytes32 reverseNode, string calldata _name) external;
}
