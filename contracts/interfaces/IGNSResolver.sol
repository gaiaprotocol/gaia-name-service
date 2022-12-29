// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IGNSResolver {
    /**
     * e.g.
     * AddressChanged(namehash("hb.gaia"), 0x1234....abcd)
     */
    event AddressChanged(bytes32 indexed node, address newAddress);

    /**
     * e.g.
     * NameChanged(namehash("1234....abcd.addr.reverse"), "hb.gaia")
     */
    event NameChanged(bytes32 indexed node, string name);
    event SetController(address newController);

    function controller() external view returns (address);

    /**
     * e.g.
     * node : namehash("hb.gaia")
     * return : 0x1234....abcd
     */
    function addr(bytes32 node) external view returns (address);

    /**
     * e.g.
     * node : namehash("1234....abcd.addr.reverse")
     * return : "hb.gaia"
     */
    function name(bytes32 reverseNode) external view returns (string memory);

    /**
     * e.g.
     * node : namehash("hb.gaia")
     * a : 0x1234....abcd
     */
    function setAddr(bytes32 node, address a) external;

    /**
     * e.g.
     * reverseNode : namehash("1234....abcd.addr.reverse")
     * _name : "hb.gaia"
     */
    function setName(bytes32 reverseNode, string calldata _name) external;
}
