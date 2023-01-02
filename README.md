# Gaia Name Service

## Terminology

Gaia Name Service 는 ENS 를 기반으로 수정된 프로토콜이다.  
따라서 ENS 에서 올바르지 않게 혼용되었던 용어들이 Gaia Name Service 의 계약에 일정부분 남아있다.  
여기서는 기본적인 용어의 정의와 예시를 설명하며, 더욱 자세한 내용은 계약의 interface 와 test 를 살피길 바란다.

| 용어      | 설명                                    | 예시                                     |
| --------- | --------------------------------------- | ---------------------------------------- |
| name      | GNS name                                | "thegreathb.gaia"                        |
| namehash  | ENS namehash 알고리즘으로 만들어진 hash | ethers.utils.namehash("thegreathb.gaia") |
| node      | namehash 와 동일                        | ethers.utils.namehash("thegreathb.gaia") |
| label     | GNS name 에서 .gaia 의 앞부분           | "thegreathb"                             |
| labelhash | label 을 keccak256 한 값                | ethers.utils.id("thegreathb")            |
| tokenId   | labelhash 와 동일                       | ethers.utils.id("thegreathb")            |

## How To Use Gaia Name Service

Gaia Name Service 의 스마트 계약은 총 3 개로 다음과 같다.

[GNS.sol](/contracts/GNS.sol)  
[GNSResolver.sol](/contracts/GNSResolver.sol)  
[GNSController.sol](/contracts/GNSController.sol)

### 1. [GNS.sol](/contracts/GNS.sol)

GNS 는 ERC721 의 구현체로, 각 토큰의 만료시점인 expiries(uint256 tokenId)를 계약에 저장한다.

controller() 를 통해서만 register 와 renew 의 호출이 가능하다.  
GNS 에는 expiries 이외에도 GRACE_PERIOD 가 존재하는데, expired 된 이후에 GRACE_PERIOD 가 지나기 전까지는 register 가 불가능하지만, renew 는 가능하다.

register 는 토큰을 발행하고 만료시점을 등록한다.  
이때 아직 해당 토큰의 expiries + GRACE_PERIOD가 지나지 않았다면, register 가 불가능하다.  
만약 GRACE_PERIOD 까지 지났다면, register 호출 시, 해당 토큰은 기존 보유중이었던 지갑에서 burn 이 되었다가 register 호출 시 설정된 owner 에게 mint 된다.

renew 는 expiries + GRACE_PERIOD 가 지나지 않은 토큰을 대상으로 duration 만큼 만료시점을 연장시킨다.

GNS 에서 tokenId 는 labelHash 와 같다.  
e.g.) "thegreathb.gaia" 의 경우, "thegreathb" 의 keccak256 을 10진수로 나타낸 것과 같으며, 이는 ethers.utils.id("thegreathb") 로 쉽게 구할 수 있다.  

### 2. [GNSResolver.sol](/contracts/GNSResolver.sol)

GNSResolver 는 특정 이름의 resolved address 와 특정 주소의 primary name 을 저장하고 보여주는 계약이다.

controller() 를 통해서만 setAddr 와 setName 의 호출이 가능하다.

GNSResolver 에서 node 는 namehash 와 같고, reverseNode 는 주소를 string 으로 하여 앞의 prefix("0x")를 제거한 뒤, 뒤에 ".addr.reverse" 를 붙인 뒤 namehash 한 것과 같다.

e.g.) "thegreathb.gaia" 의 경우, node 는 ethers.utils.namehash("thegreathb.gaia") 로 구할 수 있고, "0xabcd....1234" 의 primary name 은 ethers.utils.namehash("abcd....1234.addr.reverse") 로 구할 수 있다.  

GNSResolver 와 GNS 계약은 분리되어 있기에, 해당 GNS name 이 만료가 되었더라도 GNSResolver 에서는 해당 사실을 체크하지 않는다.  
GNSResolver 에서 addr 함수 호출 시, 만료여부와 상관없이 resolved address 를 반환하니, 이를 방지하고 싶다면 dapp 에서 GNS 의 expired(uint256 tokenId) 함수를 호출하여 만료여부를 확인토록 하자.  

### 3. [GNSController.sol](/contracts/GNSController.sol)

GNSResolver 는 GNS 와 GNSResolver 의 storage data 를 컨트롤 하는 계약이다.

계약의 register 와 renew 함수가 호출될 때, oracle 에서 지불해야할 token 의 주소와 price 및 추가 정보들을 서명해서 함수의 인자로 넣어준다.  
oracle, resolver 및 treasury 의 주소는 계약의 owner 가 수정이 가능하다.

GNS 의 이름은 ".gaia" 를 제외한 앞부분(label)이 3자리를 넘어야 한다.  
이는 valid(string) 함수로 확인할 수 있다.

labelHash, node 와 reverseNode 는 각기 getLabelHash(string), getNode(bytes32) 와 getReverseNode(address) 로 온체인으로도 얻을 수 있다.

계약에서 domainManagers(bytes32 node) 는 해당 GNS 의 resolved address 를 설정할 수 있는 권한을 가진 매니저를 말한다.  
key 는 oracle 에서 서명할 때 넣어주는 무작위 key 를 의미하며, usedKeys 를 통해 해당 key 가 사용되었는지 확인할 수 있다.  
사용된 key 는 더이상 사용 할 수 없다.

register 함수에서 nameOwner 는 토큰이 mint 되는 지갑을 의미한다.  
이때 duration 은 MIN_REGISTRATION_DURATION() 이상이어야 한다.

renew 함수는 msg.sender 가 보유하고 있지 않는 GNS 를 대상으로도 연장이 가능하다.  
그렇다고 GNS 의 소유권 등이 이동되지는 않는다. (타 지갑의 GNS 의 유효기간을 대리 연장해 주는 것)  
이때 duration 은 0 이 아닌 모든 값이 가능하다.

updateDomainManager 함수는 해당 토큰의 현재 domainManager 이거나 실제 GNS 토큰을 보유 중인 지갑만 호출이 가능하다.  
인자로는 labelHash 와 새로운 domainManager 의 address 를 받는다.

setAddr 함수는 해당 토큰의 현재 domainManager 만 호출이 가능하다.  
인자로는 labelHash 와 resolved 될 address 를 받는다.

setName 함수는 누구나 원하는 이름으로 해당 지갑의 primary name 을 설정할 수 있다.  
따라서 dapp 에서 지갑주소를 GNS name 으로 나타내고 싶다면, offchain 에서 resolver 의 name(string) 함수를 호출하여 해당 지갑 주소로 등록된 primary name 을 얻고, 그 primary name 의 node 를 addr(bytes32) 함수의 인자로 호출하여 반환된 주소가 지갑의 주소와 동일한지 확인해야 한다.  
만약 이때 expired 된 GNS 는 예외처리 하고 싶다면, 최종적으로 GNS 의 expired(uint256 tokenId) 를 확인하여 만료여부 또한 체크해야 한다.  


## Special Note

GNS name 에서 대문자는 모두 소문자로 변경하고, underscore("_") 를 사용하지 않는 등의, normalize 절차가 필요하다.  
이는 [ENS name processing - Normalising Names](https://docs.ens.domains/contract-api-reference/name-processing#normalising-names) 참고토록 하자.  

[@ensdomains/eth-ens-namehash](https://www.npmjs.com/package/@ensdomains/eth-ens-namehash) 를 통해 normalize 와 namehash 를 모두 사용할 수 있다.

## Contact

- [TheGreatHB](https://twitter.com/TheGreatHB_/)
