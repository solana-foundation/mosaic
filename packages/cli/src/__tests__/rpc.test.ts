import { DEVNET_RPC_URL, resolveRpcUrl } from '../utils/rpc';

const FLAG_URL = 'http://127.0.0.1:8899';
const CONFIG_URL = 'https://api.mainnet-beta.solana.com';

// `solana config set --url <CONFIG_URL>` as getSolanaConfig parses it, and a machine without one.
const withConfig = () => ({ json_rpc_url: CONFIG_URL });
const withoutConfig = () => null;

describe('resolveRpcUrl', () => {
    it('prefers --rpc-url over the Solana CLI config', () => {
        expect(resolveRpcUrl(FLAG_URL, withConfig)).toBe(FLAG_URL);
    });

    it('falls back to the Solana CLI config when --rpc-url is omitted', () => {
        expect(resolveRpcUrl(undefined, withConfig)).toBe(CONFIG_URL);
    });

    it('falls back to devnet when there is neither --rpc-url nor a Solana CLI config', () => {
        expect(resolveRpcUrl(undefined, withoutConfig)).toBe(DEVNET_RPC_URL);
    });

    it('falls back to devnet when the Solana CLI config has no json_rpc_url', () => {
        expect(resolveRpcUrl(undefined, () => ({ json_rpc_url: '' }))).toBe(DEVNET_RPC_URL);
    });
});
