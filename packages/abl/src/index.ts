
import {
    getAddressEncoder,
    getProgramDerivedAddress,
    getUtf8Encoder,
    type Address,
    type ProgramDerivedAddress,
} from '@solana/kit';

export type ListConfigSeeds = {
    authority: Address;
    seed: Address;
};

export async function findListConfigPda(
    seeds: ListConfigSeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = 'Eba1ts11111111111111111111111111111111111111' as Address<'Eba1ts11111111111111111111111111111111111111'>,
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getUtf8Encoder().encode('list_config'),
            getAddressEncoder().encode(seeds.authority),
            getAddressEncoder().encode(seeds.seed),
        ],
    });
}

export type ABWalletSeeds = {
    wallet: Address;
    list: Address;
};

export async function findABWalletPda(
    seeds: ABWalletSeeds,
    config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
    const {
        programAddress = 'Eba1ts11111111111111111111111111111111111111' as Address<'Eba1ts11111111111111111111111111111111111111'>,
    } = config;
    return await getProgramDerivedAddress({
        programAddress,
        seeds: [
            getAddressEncoder().encode(seeds.list),
            getAddressEncoder().encode(seeds.wallet),
        ],
    });
}

export * from './generated';