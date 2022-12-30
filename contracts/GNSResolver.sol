// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/IGNSResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GNSResolver is IGNSResolver, Ownable {
    modifier onlyController() {
        if (msg.sender != controller) revert InvalidCaller();
        _;
    }

    address public controller;
    mapping(bytes32 => address) internal _addresses;
    mapping(bytes32 => string) internal _names;

    function setController(address _controller) external onlyOwner {
        _setController(_controller);
    }

    function _setController(address _controller) internal {
        if (controller == _controller) revert UnchangedData();
        controller = _controller;
        emit SetController(_controller);
    }

    // addr(thegreathb.eth) => 0x62...
    function addr(bytes32 node) external view returns (address) {
        return _addresses[node];
    }

    // name(0x62...) => thegreathb.eth
    function name(bytes32 reverseNode) external view returns (string memory) {
        return _names[reverseNode];
    }

    function setAddr(bytes32 node, address a) external onlyController {
        emit AddressChanged(node, a);
        _addresses[node] = a;
    }

    function setName(bytes32 reverseNode, string calldata _name) external onlyController {
        _names[reverseNode] = _name;
        emit NameChanged(reverseNode, _name);
    }
}
