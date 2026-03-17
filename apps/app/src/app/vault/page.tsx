import { VaultDashboard } from '@/features/vault';

export const metadata = {
    title: 'Treasury Vault | Mosaic',
    description: 'Compliant yield-enabled cross-border treasury vault on Solana.',
};

export default function VaultPage() {
    return <VaultDashboard />;
}
