import { GNS } from "../typechain-types";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { latest, increase } = time;

const { constants } = ethers;
const { AddressZero } = constants;

let deployer: SignerWithAddress, alice: SignerWithAddress, controller: SignerWithAddress;
let gns: GNS;

const GP = 3600 * 24 * 1;

describe("GNS", function () {
    before(async () => {
        [deployer, alice, controller] = await ethers.getSigners();
    });

    it("should be that GRACE_PERIOD set correctly", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        expect(await gns.GRACE_PERIOD()).to.be.equal(GP);
    });

    it("should be only owner who can set controller", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        expect(await gns.controller()).to.be.equal(AddressZero);
        await expect(gns.connect(alice).setController(controller.address)).to.be.reverted;
        await gns.connect(deployer).setController(controller.address);
        expect(await gns.controller()).to.be.equal(controller.address);
    });

    it("should be reverted if controller is not changed", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);

        await gns.setController(controller.address);
        expect(await gns.controller()).to.be.equal(controller.address);

        await expect(gns.setController(controller.address)).to.be.revertedWithCustomError(gns, "UnchangedData");

        await expect(gns.setController(alice.address)).to.emit(gns, "SetController").withArgs(alice.address);
        expect(await gns.controller()).to.be.equal(alice.address);
    });

    it("should be that expiries set correctly", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await gns.connect(controller).register(13, alice.address, 100);
        const t = await latest();
        expect(await gns.expiries(13)).to.be.equal(t + 100);
    });

    it("should be reverted if ownerOf(id) is called but id is expred", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await gns.connect(controller).register(13, alice.address, 100);
        const t = await latest();

        expect(await gns.ownerOf(13)).to.be.equal(alice.address);
        await increase(10);
        expect(await gns.ownerOf(13)).to.be.equal(alice.address);
        await increase(100);
        await expect(gns.ownerOf(13)).to.be.revertedWithCustomError(gns, "InvalidId");
    });

    it("should be that available(id) returns a correct value", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        expect(await gns.available(13)).to.be.equal(true);

        await gns.connect(controller).register(13, alice.address, 100);
        const t = await latest();

        expect(await gns.available(13)).to.be.equal(false);

        await increase(200);
        await mine();
        expect(await gns.available(13)).to.be.equal(false);
        expect(await gns.expiries(13)).to.be.lt(await latest());
        expect((await gns.expiries(13)).add(GP)).to.be.gt(await latest());

        await increase(GP);
        await mine();
        expect(await gns.available(13)).to.be.equal(true);
        expect(await gns.expiries(13)).to.be.lt(await latest());
        expect((await gns.expiries(13)).add(GP)).to.be.lt(await latest());
    });

    it("should be only controller who can call register and renew", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await expect(gns.connect(alice).register(13, alice.address, 100)).to.be.revertedWithCustomError(gns, "InvalidCaller");

        await expect(gns.connect(alice).renew(13, 100)).to.be.revertedWithCustomError(gns, "InvalidCaller");
    });

    it("should be reverted if register(id,owner,duration) is called but a gns of id is not available", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await gns.connect(controller).register(13, alice.address, 100);
        expect(await gns.available(13)).to.be.equal(false);
        await expect(gns.connect(controller).register(13, alice.address, 100)).to.be.revertedWithCustomError(gns, "UnexpiredId");
    });

    it("should be reverted if renew(id,duration) is called but a gns of id is available", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        expect(await gns.available(13)).to.be.equal(true);
        await expect(gns.connect(controller).renew(13, 100)).to.be.revertedWithCustomError(gns, "ExpiredId");

        await gns.connect(controller).register(13, alice.address, 100);
        expect(await gns.available(13)).to.be.equal(false);

        await increase(GP + 200);
        await mine();

        expect(await gns.available(13)).to.be.equal(true);
        await expect(gns.connect(controller).renew(13, 100)).to.be.revertedWithCustomError(gns, "ExpiredId");
    });

    it("should re-mint a gns if it is minted but expired", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await gns.connect(controller).register(13, alice.address, 100);
        await increase(GP + 200);
        await mine();

        const tx = await gns.connect(controller).register(13, deployer.address, 100);
        const res = await tx.wait();

        expect(res.events?.length).to.be.equal(3);

        let i = 0;
        for (const e of res.events as any) {
            if (e.event === "Transfer") {
                if (i === 0) {
                    expect(e.args[0]).to.be.equal(alice.address);
                    expect(e.args[1]).to.be.equal(AddressZero);
                    i++;
                } else {
                    expect(i).to.be.equal(1);
                    expect(e.args[0]).to.be.equal(AddressZero);
                    expect(e.args[1]).to.be.equal(deployer.address);
                    i++;
                }
            }
        }
    });

    it("should increase expiries of id when renew(id,duration) is called", async function () {
        gns = await (await ethers.getContractFactory("GNS")).deploy(1);
        await gns.connect(deployer).setController(controller.address);

        await gns.connect(controller).register(13, alice.address, 100);
        const t = await latest();
        expect(await gns.expiries(13)).to.be.equal(t + 100);

        await gns.connect(controller).renew(13, 12345);
        expect(await gns.expiries(13)).to.be.equal(t + 100 + 12345);
    });
});
