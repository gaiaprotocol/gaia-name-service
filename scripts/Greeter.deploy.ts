import { ethers } from "hardhat";

async function main() {
    const Greeter = await ethers.getContractFactory("Greeter");
    const greeter = await Greeter.deploy("Hello, world!");
    await greeter.deployed();
    console.log(`Greeter address: ${greeter.address}`)

    await greeter.setGreeting("Hola, mundo!");
}

main()