// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./GNS.sol";
import "./DefaultResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

contract GNSController is Ownable, Multicall {
    using SafeERC20 for IERC20;

    event NameRegistered(string name, bytes32 indexed labelHash, address indexed owner, uint256 price, uint256 expires);
    event NameRenewed(string name, bytes32 indexed labelHash, uint256 price, uint256 expires);
    event UpdateDomainManager(bytes32 indexed node, address indexed manager);
    event SetResolver(DefaultResolver newResolver);
    event SetOracle(address newOracle);
    event SetTreasury(address newTreasury);

    // namehash('gaia')
    bytes32 public constant BASE_NODE = 0x208d08353bf873e56f266090aab1ec351ccad4cc72055f05a0817031e9018b33;
    // namehash('addr.reverse')
    bytes32 public constant ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;

    GNS public immutable gns;
    DefaultResolver public resolver;
    address public oracle;
    address public treasury;
    mapping(bytes32 => address) public domainManagers;
    mapping(uint256 => bool) public usedKeys;

    constructor(
        GNS _gns,
        DefaultResolver _resolver,
        address _oracle,
        address _treasury
    ) {
        gns = _gns;
        _setResolver(_resolver);
        _setOracle(_oracle);
        _setTreasury(_treasury);
    }

    function setResolver(DefaultResolver _resolver) external onlyOwner {
        _setResolver(_resolver);
    }

    function _setResolver(DefaultResolver _resolver) internal {
        require(resolver != _resolver, "UNCHANGED");
        resolver = _resolver;
        emit SetResolver(_resolver);
    }

    function setOracle(address _oracle) external onlyOwner {
        _setOracle(_oracle);
    }

    function _setOracle(address _oracle) internal {
        require(oracle != _oracle, "UNCHANGED");
        oracle = _oracle;
        emit SetOracle(_oracle);
    }

    function setTreasury(address _treasury) external onlyOwner {
        _setTreasury(_treasury);
    }

    function _setTreasury(address _treasury) internal {
        require(treasury != _treasury, "UNCHANGED");
        treasury = _treasury;
        emit SetTreasury(_treasury);
    }

    function recoverFunds(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        IERC20(_token).safeTransfer(_to, _amount);
    }

    function valid(string calldata name) public pure returns (bool) {
        return strlen(name) >= 3;
    }

    function available(string calldata name) external view returns (bool) {
        return valid(name) && gns.available(uint256(getLabelHash(name)));
    }

    function register(
        string calldata name,
        address owner,
        address domainManager,
        uint256 duration,
        bytes calldata data,
        bytes32 r,
        bytes32 vs
    ) external {
        require(valid(name), "INVALID_NAME");
        require(duration >= MIN_REGISTRATION_DURATION, "TOO_SHORT_DURATION");

        bytes32 labelHash = getLabelHash(name);
        uint256 price;
        {
            // to avoid stack-too-deep error
            address token;
            uint256 key;
            uint256 deadline;
            (token, price, key, deadline) = abi.decode(data, (address, uint256, uint256, uint256));
            _checkOracle(
                keccak256(
                    abi.encodePacked(labelHash, owner, duration, token, price, key, block.chainid, address(this))
                ),
                r,
                vs
            );
            require(deadline >= block.timestamp, "DEADLINE_EXPIRED");
            require(!usedKeys[key], "USED_KEY");
            usedKeys[key] = true;
            IERC20(token).safeTransferFrom(msg.sender, treasury, price);

            bytes32 node = getNode(labelHash);
            domainManagers[node] = domainManager;
        }

        uint256 expires = gns.register(uint256(labelHash), owner, duration);
        emit NameRegistered(name, labelHash, owner, price, expires);
    }

    function renew(
        string calldata name,
        uint256 duration,
        bytes calldata data,
        bytes32 r,
        bytes32 vs
    ) external {
        bytes32 labelHash = getLabelHash(name);
        (address token, uint256 price, uint256 key, uint256 deadline) = abi.decode(
            data,
            (address, uint256, uint256, uint256)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(labelHash, duration, token, price, key, block.chainid, address(this))
        );
        _checkOracle(hash, r, vs);

        require(deadline >= block.timestamp, "DEADLINE_EXPIRED");
        require(!usedKeys[key], "USED_KEY");

        IERC20(token).safeTransferFrom(msg.sender, treasury, price);

        usedKeys[key] = true;
        uint256 expires = gns.renew(uint256(labelHash), duration);

        emit NameRenewed(name, labelHash, price, expires);
    }

    function _checkOracle(
        bytes32 hash,
        bytes32 r,
        bytes32 vs
    ) internal view {
        bytes32 message = ECDSA.toEthSignedMessageHash(hash);
        require(ECDSA.recover(message, r, vs) == oracle, "INVALID_ORACLE");
    }

    function updateDomainManager(bytes32 node, address addr) external {
        require(domainManagers[node] == msg.sender || gns.ownerOf(uint256(node)) == msg.sender, "UNAUTHRIZED");
        _updateDomainManager(node, addr);
    }

    function setAddr(bytes32 node, address addr) external {
        require(domainManagers[node] == msg.sender, "INVALID_CALLER");
        _setAddr(node, addr);
    }

    function setName(string calldata name) external {
        _setName(msg.sender, name);
    }

    function _updateDomainManager(bytes32 node, address addr) internal {
        domainManagers[node] = addr;
        emit UpdateDomainManager(node, addr);
    }

    function _setAddr(bytes32 node, address addr) internal {
        resolver.setAddr(node, addr);
    }

    function _setName(address addr, string calldata name) internal {
        resolver.setName(getReverseNode(addr), name);
    }

    // only label. without '.gaia'
    function getLabelHash(string calldata label) public pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function getNode(bytes32 labelHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(BASE_NODE, labelHash));
    }

    function getReverseNode(address addr) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(ADDR_REVERSE_NODE, sha3HexAddress(addr)));
    }

    function sha3HexAddress(address addr) private pure returns (bytes32 ret) {
        assembly {
            let lookup := 0x3031323334353637383961626364656600000000000000000000000000000000

            for {
                let i := 40
            } gt(i, 0) {

            } {
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
            }

            ret := keccak256(0, 40)
        }
    }

    function strlen(string calldata s) internal pure returns (uint256) {
        uint256 len;
        uint256 i = 0;
        uint256 bytelength = bytes(s).length;
        for (len = 0; i < bytelength; len++) {
            bytes1 b = bytes(s)[i];
            if (b < 0x80) {
                i += 1;
            } else if (b < 0xE0) {
                i += 2;
            } else if (b < 0xF0) {
                i += 3;
            } else if (b < 0xF8) {
                i += 4;
            } else if (b < 0xFC) {
                i += 5;
            } else {
                i += 6;
            }
        }
        return len;
    }
}
