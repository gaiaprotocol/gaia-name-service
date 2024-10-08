import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish, BytesLike, utils, Wallet } from "ethers";

const { solidityKeccak256, arrayify } = utils;

export const getDataHash = (token: BytesLike, price: BigNumberish, key: BigNumberish, deadline: BigNumberish) => {
    return defaultAbiCoder.encode(["address", "uint256", "uint256", "uint256"], [token, price, key, deadline]);
};

export const getSignature = async (
    oracle: Wallet,
    labelHash: BytesLike,
    nameOwer: BytesLike | undefined,
    duration: BigNumberish,
    token: BytesLike,
    price: BigNumberish,
    key: BigNumberish,
    deadline: BigNumberish,
    chainId: BigNumberish,
    thisAddr: BytesLike
) => {
    let hash = "";
    if (nameOwer)
        hash = solidityKeccak256(
            ["bytes32", "address", "uint256", "address", "uint256", "uint256", "uint256", "uint256", "address"],
            [labelHash, nameOwer, duration, token, price, key, deadline, chainId, thisAddr]
        );
    else
        hash = solidityKeccak256(
            ["bytes32", "uint256", "address", "uint256", "uint256", "uint256", "uint256", "address"],
            [labelHash, duration, token, price, key, deadline, chainId, thisAddr]
        );

    const message = arrayify(hash);
    const sig = utils.splitSignature(await oracle.signMessage(message));
    return { r: sig.r, vs: sig._vs };
};
