// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DefaultResolver is Ownable {
    event AddressChanged(bytes32 indexed node, address newAddress);
    event NameChanged(bytes32 indexed node, string name);
    event SetController(address newController);

    modifier onlyController() {
        require(msg.sender == controller, "NOT_FROM_CONTROLLER");
        _;
    }

    // namehash('gaia')
    bytes32 public constant BASE_NODE = 0x208d08353bf873e56f266090aab1ec351ccad4cc72055f05a0817031e9018b33;

    // namehash('addr.reverse')
    bytes32 public constant ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    address public controller;
    mapping(bytes32 => address) internal _addresses;
    mapping(bytes32 => string) internal _names;

    constructor(address _controller) {
        _setController(_controller);
    }

    function setController(address _controller) external onlyOwner {
        _setController(_controller);
    }

    function _setController(address _controller) internal {
        require(controller != _controller, "UNCHANGED");
        controller = _controller;
        emit SetController(_controller);
    }

    function setAddr(bytes32 node, address a) external onlyController {
        emit AddressChanged(node, a);
        _addresses[node] = a;
    }

    // addr(thegreathb.eth) => 0x62...
    function addr(bytes32 node) external view returns (address) {
        return _addresses[node];
    }

    function setName(bytes32 reverseNode, string calldata _name) external onlyController {
        _names[reverseNode] = _name;
        emit NameChanged(reverseNode, _name);
    }

    // name(0x62...) => thegreathb.eth
    function name(bytes32 reverseNode) external view returns (string memory) {
        return _names[reverseNode];
    }
}
