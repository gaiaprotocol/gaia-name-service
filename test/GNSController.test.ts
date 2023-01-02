import { GNS, GNSController, GNSResolver, ERC20Mock } from "../typechain-types";
import { time, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";

import { getDataHash, getSignature } from "./utils/tools";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumberish, utils, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { latestBlock, increase, latest, increaseTo } = time;

const { constants } = ethers;
const { AddressZero } = constants;
const { namehash, id } = utils;

const GP = 3600 * 24 * 1;

let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
let oracle: Wallet;
let treasury: Wallet;
let gns: GNS;
let controller: GNSController;
let resolver: GNSResolver;
let USDC: ERC20Mock;
let token: string;

describe("GNSController", function () {
    async function setupFixture() {
        oracle = Wallet.createRandom();
        treasury = Wallet.createRandom();

        USDC = await (await ethers.getContractFactory("ERC20Mock")).deploy();
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        resolver = await (await ethers.getContractFactory("GNSResolver")).deploy();
        controller = await (await ethers.getContractFactory("GNSController")).deploy(gns.address, resolver.address, oracle.address, treasury.address, 2);
        token = USDC.address;

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
        it("should be that initial values are set correctly", async () => {
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
            await expect(controller.connect(alice).recoverFunds(token, alice.address, 0)).to.be.reverted;

            await controller.connect(deployer).setResolver(alice.address);
            await controller.connect(deployer).setOracle(alice.address);
            await controller.connect(deployer).setTreasury(alice.address);
            await controller.connect(deployer).recoverFunds(token, alice.address, 0);
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

    async function tokenTransfered(target: SignerWithAddress | Wallet, amount: BigNumberish, BN: number) {
        const bal0 = await USDC.balanceOf(target.address, { blockTag: BN - 1 });
        const bal1 = await USDC.balanceOf(target.address, { blockTag: BN });
        expect(bal1.sub(bal0)).to.be.equal(amount);
    }

    describe("register", () => {
        const PRICE = 12345;
        const DEADLINE = 10000000000;
        const DURATION = 200000;
        const NAME = "thegreathb";
        const NODE = namehash(NAME + ".gaia");

        async function _register({
            key,
            name = NAME,
            caller = alice,
            nameOwner = alice,
            domainManager = alice,
            duration = DURATION,
            price = PRICE,
            deadline = DEADLINE,
        }: {
            key: BigNumberish;
            name?: string;
            caller?: SignerWithAddress;
            nameOwner?: SignerWithAddress;
            domainManager?: SignerWithAddress;
            duration?: number;
            price?: number;
            deadline?: number;
        }) {
            const sig = await getSignature(oracle, id(name), nameOwner.address, duration, token, price, key, deadline, 31337, controller.address);

            await controller
                .connect(caller)
                .register(name, nameOwner.address, domainManager.address, duration, getDataHash(token, price, key, deadline), sig.r, sig.vs);
        }

        describe("revert tests", () => {
            context("with a name whose length is lt 3", () => {
                it("reverts", async () => {
                    await expect(_register({ key: 1, name: "hb" })).to.be.revertedWithCustomError(controller, "InvalidName");
                });
            });
            context("with a duration lt MIN_REGISTRATION_DURATION", () => {
                it("reverts", async () => {
                    await expect(_register({ key: 1, duration: 100 })).to.be.revertedWithCustomError(controller, "TooShortDuration");
                });
            });
            context("when deadline is over", () => {
                it("reverts", async () => {
                    const t = await latest();
                    await expect(_register({ key: 1, deadline: t - 10 })).to.be.revertedWithCustomError(controller, "ExpiredDeadline");
                });
            });
            context("with an used key", () => {
                it("reverts", async () => {
                    const key = 1;
                    expect(await controller.usedKeys(key)).to.be.false;
                    await _register({ key: key, name: "greathb" });
                    expect(await controller.usedKeys(key)).to.be.true;
                    await expect(_register({ key: key, name: "thegreathb" })).to.be.revertedWithCustomError(controller, "UsedKey");
                });
            });
            context("with an invalid signature", () => {
                it("reverts", async () => {
                    const name = "thegreathb";
                    const key = 1;

                    const invalidSig = await getSignature(
                        oracle,
                        id(name),
                        alice.address,
                        DURATION,
                        token,
                        PRICE,
                        key,
                        DEADLINE * 100,
                        31337,
                        controller.address
                    );

                    await expect(
                        controller
                            .connect(alice)
                            .register(name, alice.address, alice.address, DURATION, getDataHash(token, PRICE, key, DEADLINE), invalidSig.r, invalidSig.vs)
                    ).to.be.revertedWithCustomError(controller, "InvalidOracle");
                });
            });
            context("with an unexpired name", () => {
                it("reverts", async () => {
                    const name = "thegreathb";
                    await _register({ key: 1, name: name });
                    await expect(_register({ key: 2, name: name })).to.be.revertedWithCustomError(gns, "UnexpiredId");
                });
            });
        });

        context("when register was successful", () => {
            const KEY = 1;
            let pBN = 0;
            let expiry = 0;
            beforeEach(async () => {
                await _register({ key: KEY });
                pBN = (await latestBlock()) - 1;
                expiry = (await latest()) + DURATION;
            });

            it("creates the token", async () => {
                expect(await gns.ownerOf(id(NAME))).to.be.equal(alice.address);
                await expect(gns.ownerOf(id(NAME), { blockTag: pBN })).to.be.revertedWithCustomError(gns, "InvalidId");
            });

            it("transfers tokens", async () => {
                await tokenTransfered(alice, -PRICE, pBN + 1);
                await tokenTransfered(treasury, PRICE, pBN + 1);
            });

            it("sets the key as used", async () => {
                expect(await controller.usedKeys(KEY)).to.be.equal(true);
                expect(await controller.usedKeys(KEY, { blockTag: pBN })).to.be.equal(false);
            });

            it("updates an expiry", async () => {
                expect(await gns.expiries(id(NAME))).to.be.equal(expiry);
                expect(await gns.expiries(id(NAME), { blockTag: pBN })).to.be.equal(0);
            });

            it("updates a domainManager", async () => {
                expect(await controller.domainManagers(NODE)).to.be.equal(alice.address);
                expect(await controller.domainManagers(NODE, { blockTag: pBN })).to.be.equal(AddressZero);
            });

            it("emits a NameRegistered event", async () => {
                const events = await controller.queryFilter(controller.filters.NameRegistered(), pBN + 1);
                expect(events.length).to.be.equal(1);
                expect(events[0].args[0]).to.be.equal(NAME);
                expect(events[0].args[1]).to.be.equal(id(NAME));
                expect(events[0].args[2]).to.be.equal(alice.address);
                expect(events[0].args[3]).to.be.equal(token);
                expect(events[0].args[4]).to.be.equal(PRICE);
                expect(events[0].args[5]).to.be.equal(expiry);
            });

            it("emits a UpdateDomainManager event", async () => {
                const events = await controller.queryFilter(controller.filters.UpdateDomainManager(), pBN + 1);
                expect(events.length).to.be.equal(1);
                expect(events[0].args[0]).to.be.equal(NODE);
                expect(events[0].args[1]).to.be.equal(alice.address);
            });

            it("doesn't set addr and name in resolver automatically", async () => {
                expect(await resolver.addr(NODE)).to.be.equal(AddressZero);
                expect(await resolver.name(await controller.getReverseNode(alice.address))).to.be.equal("");
            });
        });

        describe("deep tests", () => {
            const key = 1;
            it("sets addr and name in resolver simultaneously if multicall is used", async () => {
                const sig = await getSignature(oracle, id(NAME), alice.address, DURATION, token, PRICE, key, DEADLINE, 31337, controller.address);

                const registerTxData = await controller.interface.encodeFunctionData("register", [
                    NAME,
                    alice.address,
                    alice.address,
                    DURATION,
                    getDataHash(token, PRICE, key, DEADLINE),
                    sig.r,
                    sig.vs,
                ]);
                const setAddrTxData = await controller.interface.encodeFunctionData("setAddr", [id(NAME), alice.address]);
                const setNameTxData = await controller.interface.encodeFunctionData("setName", [NAME]);

                await controller.connect(alice).multicall([registerTxData, setAddrTxData, setNameTxData]);

                expect(await resolver.addr(NODE)).to.be.equal(alice.address);
                expect(await resolver.name(await controller.getReverseNode(alice.address))).to.be.equal(NAME);
            });

            it("reverts in multicall if domainManager is not msg.sender", async () => {
                const sig = await getSignature(oracle, id(NAME), alice.address, DURATION, token, PRICE, key, DEADLINE, 31337, controller.address);

                const registerTxData = await controller.interface.encodeFunctionData("register", [
                    NAME,
                    alice.address,
                    bob.address, //domainManager is Bob.
                    DURATION,
                    getDataHash(token, PRICE, key, DEADLINE),
                    sig.r,
                    sig.vs,
                ]);
                const setAddrTxData = await controller.interface.encodeFunctionData("setAddr", [id(NAME), alice.address]);

                await expect(controller.connect(alice).multicall([registerTxData, setAddrTxData])).to.be.revertedWithCustomError(controller, "Unauthorized");
            });

            it("can register GNS for an another wallet", async () => {
                const CALLER = alice;
                const NAME_OWNER = bob;
                const DOMAIN_MANAGER = carol;

                await _register({ key: key, caller: CALLER, nameOwner: NAME_OWNER, domainManager: DOMAIN_MANAGER });

                // Caller payed the price
                const bn = await latestBlock();
                await tokenTransfered(CALLER, -PRICE, bn);
                await tokenTransfered(NAME_OWNER, 0, bn);
                await tokenTransfered(DOMAIN_MANAGER, 0, bn);
                await tokenTransfered(treasury, PRICE, bn);

                // nft goes to NAME_OWNER
                expect(await gns.ownerOf(id(NAME))).to.be.equal(bob.address);

                // domainManager has been set
                expect(await controller.domainManagers(NODE)).to.be.equal(carol.address);
            });

            context("when GNS was already registered by someone else", () => {
                const KEY = 1;
                let expiry = 0;
                beforeEach(async () => {
                    await _register({ key: KEY });
                    expiry = (await latest()) + DURATION;
                });

                context("when the expiry period is not over yet", () => {
                    it("reverts", async () => {
                        await expect(_register({ key: 2, nameOwner: bob })).to.be.revertedWithCustomError(gns, "UnexpiredId");
                        expect(expiry).to.be.gt(await latest());
                    });
                });

                context("when the expiry period is over but still in the GRACE_PERIOD yet", () => {
                    it("reverts", async () => {
                        await increase(DURATION);
                        await expect(_register({ key: 2, nameOwner: bob })).to.be.revertedWithCustomError(gns, "UnexpiredId");
                        expect(expiry).to.be.lt(await latest());
                        expect(expiry + GP).to.be.gt(await latest());

                        expect(await gns.available(id(NAME))).to.be.false;
                    });
                });

                context("when the expiry period and the GRACE_PERIOD are over", () => {
                    it("burns GNS token from a previous nameOwner and re-mints to a new nameOwner", async () => {
                        await increase(DURATION + GP);
                        await mine();

                        expect(await gns.available(id(NAME))).to.be.true;
                        await _register({ key: 2, nameOwner: bob });

                        expect(expiry + GP).to.be.lt(await latest());

                        const events = await gns.queryFilter(gns.filters.Transfer(), await latestBlock());
                        expect(events.length).to.be.equal(2);
                        expect(events[0].args[0]).to.be.equal(alice.address);
                        expect(events[0].args[1]).to.be.equal(AddressZero);
                        expect(events[0].args[2]).to.be.equal(id(NAME));

                        expect(events[1].args[0]).to.be.equal(AddressZero);
                        expect(events[1].args[1]).to.be.equal(bob.address);
                        expect(events[1].args[2]).to.be.equal(id(NAME));
                    });
                });
            });
        });
    });

    describe("renew", () => {
        const PRICE = 4321;
        const DEADLINE = 11000000000;
        const DURATION = 1000;
        const NAME = "thegreathb";
        let expiry = 0;

        async function _renew({
            key,
            name = NAME,
            caller = alice,
            duration = DURATION,
            price = PRICE,
            deadline = DEADLINE,
        }: {
            key: BigNumberish;
            name?: string;
            caller?: SignerWithAddress;
            duration?: number;
            price?: number;
            deadline?: number;
        }) {
            const sig = await getSignature(oracle, id(name), undefined, duration, token, price, key, deadline, 31337, controller.address);

            await controller.connect(caller).renew(name, duration, getDataHash(token, price, key, deadline), sig.r, sig.vs);
        }

        beforeEach(async () => {
            const _PRICE = 12345;
            const _DEADLINE = 10000000000;
            const _DURATION = 200000;
            const _KEY = 2;

            const sig = await getSignature(oracle, id(NAME), alice.address, _DURATION, token, _PRICE, _KEY, _DEADLINE, 31337, controller.address);

            await controller.connect(alice).register(NAME, alice.address, alice.address, _DURATION, getDataHash(token, _PRICE, _KEY, _DEADLINE), sig.r, sig.vs);
            expiry = (await latest()) + _DURATION;
        });

        describe("revert tests", () => {
            context("when deadline is over", () => {
                it("reverts", async () => {
                    const t = await latest();
                    await expect(_renew({ key: 1, deadline: t - 10 })).to.be.revertedWithCustomError(controller, "ExpiredDeadline");
                });
            });
            context("with an used key", () => {
                it("reverts", async () => {
                    const usedKey = 2;
                    expect(await controller.usedKeys(usedKey)).to.be.true;
                    await expect(_renew({ key: usedKey })).to.be.revertedWithCustomError(controller, "UsedKey");
                });
            });
            context("with an invalid signature", () => {
                it("reverts", async () => {
                    const key = 1;

                    const invalidSig = await getSignature(
                        oracle,
                        id(NAME),
                        alice.address,
                        DURATION,
                        token,
                        PRICE - 1,
                        key,
                        DEADLINE,
                        31337,
                        controller.address
                    );

                    await expect(
                        controller.connect(alice).renew(NAME, DURATION, getDataHash(token, PRICE, key, DEADLINE), invalidSig.r, invalidSig.vs)
                    ).to.be.revertedWithCustomError(controller, "InvalidOracle");
                });
            });
            context("with an unregistered name", () => {
                it("reverts", async () => {
                    const name = "greathb";
                    await expect(_renew({ key: 1, name: name })).to.be.revertedWithCustomError(gns, "ExpiredId"); // It says "ExpiredId" even though the id was not registered.
                });
            });
            context("with an expired name", () => {
                it("reverts", async () => {
                    await increaseTo(expiry + GP);
                    await expect(_renew({ key: 1 })).to.be.revertedWithCustomError(gns, "ExpiredId");
                });
            });
        });

        context("when renew was successful", () => {
            let newExpiry = 0;
            let rnwBN = 0;
            beforeEach(async () => {
                await _renew({ key: 1 });
                rnwBN = await latestBlock();
                newExpiry = expiry + DURATION;
            });

            it("transfers tokens", async () => {
                await tokenTransfered(alice, -PRICE, rnwBN);
                await tokenTransfered(treasury, PRICE, rnwBN);
            });

            it("sets the key as used", async () => {
                expect(await controller.usedKeys(1)).to.be.equal(true);
                expect(await controller.usedKeys(1, { blockTag: rnwBN - 1 })).to.be.equal(false);
            });

            it("updates an expiry", async () => {
                expect(await gns.expiries(id(NAME))).to.be.equal(newExpiry);
                expect(await gns.expiries(id(NAME), { blockTag: rnwBN - 1 })).to.be.equal(expiry);
            });

            it("emits a NameRenewed event", async () => {
                const events = await controller.queryFilter(controller.filters.NameRenewed(), rnwBN);
                expect(events.length).to.be.equal(1);
                expect(events[0].args[0]).to.be.equal(NAME);
                expect(events[0].args[1]).to.be.equal(id(NAME));
                expect(events[0].args[2]).to.be.equal(token);
                expect(events[0].args[3]).to.be.equal(PRICE);
                expect(events[0].args[4]).to.be.equal(newExpiry);
            });
        });

        describe("deep tests", () => {
            it("accepts any duration except 0", async () => {
                await _renew({ key: 10, duration: 1 });
                await _renew({ key: 11, duration: 100 });
                await expect(_renew({ key: 12, duration: 0 })).to.be.revertedWithCustomError(controller, "TooShortDuration");
            });

            it("can renew GNS which is not caller's", async () => {
                await USDC.mint(deployer.address, PRICE);
                await _renew({ key: 10, caller: deployer });
            });

            it("can renew GNS which expired but still in GRACE_PERIOD", async () => {
                await increaseTo(expiry);
                await mine();
                expect(expiry).to.be.lt(await latest());
                expect(expiry + GP).to.be.gt(await latest());
                expect(await gns.available(id(NAME))).to.be.false;

                await _renew({ key: 10 });

                await increase(DURATION + GP);
                await mine();
                expect(await gns.available(id(NAME))).to.be.true;
                await expect(_renew({ key: 11 })).to.be.revertedWithCustomError(gns, "ExpiredId");
            });
        });
    });

    describe("update / set functions test", () => {
        const NAME = "thegreathb";
        const NODE = namehash(NAME + ".gaia");
        const PRICE = 12345;
        const DEADLINE = 10000000000;
        const DURATION = 200000;
        const KEY = 100;

        beforeEach(async () => {
            const CALLER = alice;
            const NAME_OWNER = bob;
            const DOMAIN_MANAGER = carol;

            const sig = await getSignature(oracle, id(NAME), NAME_OWNER.address, DURATION, token, PRICE, KEY, DEADLINE, 31337, controller.address);

            await controller
                .connect(CALLER)
                .register(NAME, NAME_OWNER.address, DOMAIN_MANAGER.address, DURATION, getDataHash(token, PRICE, KEY, DEADLINE), sig.r, sig.vs);
        });
        describe("updateDomainManager", () => {
            it("should be either the token owner or the domainManager who can update a domainManager", async () => {
                await expect(controller.connect(alice).updateDomainManager(id(NAME), carol.address)).to.be.revertedWithCustomError(controller, "Unauthorized");

                await controller.connect(carol).updateDomainManager(id(NAME), carol.address); //carol was the domainManager
                await controller.connect(bob).updateDomainManager(id(NAME), carol.address); //bob was the token owner
            });
            it("emits an UpdateDomainManager event", async () => {
                await controller.connect(carol).updateDomainManager(id(NAME), deployer.address);

                const events = await controller.queryFilter(controller.filters.UpdateDomainManager(), await latestBlock());
                expect(events.length).to.be.equal(1);
                expect(events[0].args[0]).to.be.equal(NODE);
                expect(events[0].args[1]).to.be.equal(deployer.address);
            });
            it("updates the domainManager of node", async () => {
                expect(await controller.domainManagers(NODE)).to.be.equal(carol.address);
                await controller.connect(carol).updateDomainManager(id(NAME), deployer.address);
                expect(await controller.domainManagers(NODE)).to.be.equal(deployer.address);
            });
        });
        describe("setAddr", () => {
            it("should be the domainManager who can set an addr", async () => {
                await expect(controller.connect(alice).setAddr(id(NAME), alice.address)).to.be.revertedWithCustomError(controller, "Unauthorized");
                await expect(controller.connect(bob).setAddr(id(NAME), alice.address)).to.be.revertedWithCustomError(controller, "Unauthorized"); //bob was the token owner

                await controller.connect(carol).setAddr(id(NAME), alice.address); //carol was the domainManager
            });
            it("updates the addr of node", async () => {
                expect(await resolver.addr(NODE)).to.be.equal(AddressZero);
                await controller.connect(carol).setAddr(id(NAME), alice.address);
                expect(await resolver.addr(NODE)).to.be.equal(alice.address);
            });
        });
        describe("setName", () => {
            it("can be any name which users can set as their own", async () => {
                await controller.connect(alice).setName("king.gaia");
                await controller.connect(bob).setName("queen.gaia");
                await controller.connect(carol).setName("happynewyear.gaia");
            });
            it("updates the name of node", async () => {
                const rNode = namehash(alice.address.slice(2) + ".addr.reverse");
                expect(await resolver.name(rNode)).to.be.equal("");
                await controller.connect(alice).setName("happynewyear.gaia");
                expect(await resolver.name(rNode)).to.be.equal("happynewyear.gaia");
            });
        });
        describe("reverseResolve test", () => {
            it("bob can set his name to something he doesn't have. but a resolved address from the name is not bob", async () => {
                // case0 : bob sets his name to something that does not exist
                await controller.connect(bob).setName("foobar.gaia");
                expect(await resolver.name(namehash(bob.address.slice(2) + ".addr.reverse"))).to.be.equal("foobar.gaia");
                expect(await resolver.addr(namehash("foobar.gaia"))).to.be.equal(AddressZero); //not bob's address

                // case1 : bob sets his name to something that someone else possesses
                const newName = "king";
                const sig = await getSignature(oracle, id(newName), carol.address, DURATION, token, PRICE, 1, DEADLINE, 31337, controller.address);

                await controller
                    .connect(alice)
                    .register(newName, carol.address, carol.address, DURATION, getDataHash(token, PRICE, 1, DEADLINE), sig.r, sig.vs);
                await controller.connect(carol).setAddr(id(newName), carol.address);

                await controller.connect(bob).setName(newName + ".gaia");
                expect(await resolver.name(namehash(bob.address.slice(2) + ".addr.reverse"))).to.be.equal(newName + ".gaia");
                expect(await resolver.addr(namehash(newName + ".gaia"))).to.be.equal(carol.address); //not bob's address

                // case2 : bob sets his name to something whose resolved address is bob's address
                await controller.connect(carol).setAddr(id(newName), bob.address); //carol sets a resolved address of "king.gaia" to bob's address
                expect(await resolver.name(namehash(bob.address.slice(2) + ".addr.reverse"))).to.be.equal(newName + ".gaia");
                expect(await resolver.addr(namehash(newName + ".gaia"))).to.be.equal(bob.address); // in this case, dapp can show "king.gaia" instead of bob's address
            });
        });
    });
});
