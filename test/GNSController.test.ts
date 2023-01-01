import { GNS, GNSController, GNSResolver, ERC20Mock } from "../typechain-types";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { getDataHash, getSignature } from "./utils/tools";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish, BytesLike, Contract, utils, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { latestBlock, setNextBlockTimestamp } = time;

const { constants, provider } = ethers;
const { AddressZero, HashZero } = constants;
const { defaultAbiCoder, namehash, id, Interface } = utils;

let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
let oracle: Wallet;
let treasury: Wallet;
let gns: GNS;
let controller: GNSController;
let resolver: GNSResolver;
let USDC: ERC20Mock;

describe("basic", function () {
    async function setupFixture() {
        oracle = Wallet.createRandom();
        treasury = Wallet.createRandom();

        USDC = await (await ethers.getContractFactory("ERC20Mock")).deploy();
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        resolver = await (await ethers.getContractFactory("GNSResolver")).deploy();
        controller = await (await ethers.getContractFactory("GNSController")).deploy(gns.address, resolver.address, oracle.address, treasury.address, 2);

        await gns.setController(controller.address);
        await resolver.setController(controller.address);

        await USDC.mint(alice.address, 1000000);
    }

    before(async () => {
        [deployer, alice, bob, carol] = await ethers.getSigners();
    });

    beforeEach(async () => {
        await loadFixture(setupFixture);
    });

    describe("basic test", () => {
        it("should be that initial values set correctly", async () => {
            expect(await controller.BASE_NODE()).to.be.equal(namehash("gaia"));
            expect(await controller.ADDR_REVERSE_NODE()).to.be.equal(namehash("addr.reverse"));
            expect(await controller.MIN_REGISTRATION_DURATION()).to.be.equal(3600 * 24 * 2);

            expect(await controller.gns()).to.be.equal(gns.address);
            expect(await controller.resolver()).to.be.equal(resolver.address);
            expect(await controller.oracle()).to.be.equal(oracle.address);
            expect(await controller.treasury()).to.be.equal(treasury.address);
        });
    });

    describe("ownership function test", () => {
        it("should be reverted if onlyOwner functions called by someone not the owner", async () => {
            await expect(controller.connect(alice).setResolver(alice.address)).to.be.reverted;
            await expect(controller.connect(alice).setOracle(alice.address)).to.be.reverted;
            await expect(controller.connect(alice).setTreasury(alice.address)).to.be.reverted;
            await expect(controller.connect(alice).recoverFunds(USDC.address, alice.address, 0)).to.be.reverted;

            await controller.connect(deployer).setResolver(alice.address);
            await controller.connect(deployer).setOracle(alice.address);
            await controller.connect(deployer).setTreasury(alice.address);
            await controller.connect(deployer).recoverFunds(USDC.address, alice.address, 0);
        });

        it("should emit an event when functions are called", async () => {
            await expect(controller.setResolver(alice.address)).to.emit(controller, "SetResolver").withArgs(alice.address);
            await expect(controller.setOracle(alice.address)).to.emit(controller, "SetOracle").withArgs(alice.address);
            await expect(controller.setTreasury(alice.address)).to.emit(controller, "SetTreasury").withArgs(alice.address);
        });

        it("should update values correctly when functions are called", async () => {
            await controller.setResolver(alice.address);
            await controller.setOracle(alice.address);
            await controller.setTreasury(alice.address);

            expect(await controller.resolver()).to.be.equal(alice.address);
            expect(await controller.oracle()).to.be.equal(alice.address);
            expect(await controller.treasury()).to.be.equal(alice.address);
        });

        it("should be reverted if input value is equal with a previous value", async () => {
            await expect(controller.setResolver(resolver.address)).to.be.revertedWithCustomError(gns, "UnchangedData");
            await expect(controller.setOracle(oracle.address)).to.be.revertedWithCustomError(gns, "UnchangedData");
            await expect(controller.setTreasury(treasury.address)).to.be.revertedWithCustomError(gns, "UnchangedData");
        });
    });

    describe("name processing test", () => {
        context("when a length of name is lt 2", () => {
            it("returns false", async () => {
                expect(await controller.valid("a")).to.be.false;
                expect(await controller.valid("ab")).to.be.false;
                expect(await controller.valid("abc")).to.be.true;
                expect(await controller.valid("abcd")).to.be.true;

                expect(await controller.valid("1")).to.be.false;
                expect(await controller.valid("11")).to.be.false;
                expect(await controller.valid("111")).to.be.true;
                expect(await controller.valid("1111")).to.be.true;
            });
        });

        context("when getLabelHash is called", () => {
            it("returns correct hex string", async () => {
                let label = "abc";
                expect(await controller.getLabelHash(label)).to.be.equal(id(label));

                label = "thegreathb";
                expect(await controller.getLabelHash(label)).to.be.equal(id(label));
            });
        });

        context("when getNode is called", () => {
            it("returns correct hex string", async () => {
                let label = "abc";
                let labelHash = await controller.getLabelHash(label);
                expect(await controller.getNode(labelHash)).to.be.equal(namehash(label + ".gaia"));

                label = "thegreathb";
                labelHash = await controller.getLabelHash(label);
                expect(await controller.getNode(labelHash)).to.be.equal(namehash(label + ".gaia"));
            });
        });

        context("when getReverseNode is called", () => {
            it("returns correct hex string", async () => {
                let addr = alice.address;
                expect(await controller.getReverseNode(addr)).to.be.equal(namehash(addr.slice(2) + ".addr.reverse"));

                addr = carol.address;
                expect(await controller.getReverseNode(addr)).to.be.equal(namehash(addr.slice(2) + ".addr.reverse"));
            });
        });
    });
});
