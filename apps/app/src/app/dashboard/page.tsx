'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Coins, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenDisplay } from '@/types/token';
import { Spinner } from '@/components/ui/spinner';
import { getAllTokens, getTokenCount } from '@/lib/token/tokenData';
import { TokenStorage } from '@/lib/token/tokenStorage';
import { useConnector } from '@solana/connector/react';
import { TokenCard } from './components/TokenCard';

export default function DashboardPage() {
    const { connected, selectedAccount } = useConnector();

    return connected && selectedAccount ? <DashboardConnected /> : <DashboardDisconnected />;
}

function DashboardConnected() {
    const [tokens, setTokens] = useState<TokenDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Load tokens from local storage
        const loadTokens = () => {
            const storedTokens = getAllTokens();
            setTokens(storedTokens);
            setLoading(false);
        };

        loadTokens();
    }, []);

    useEffect(() => {
        if (!loading && tokens.length === 0) {
            router.push('/dashboard/create');
        }
    }, [loading, tokens, router]);

    const handleDeleteToken = (address: string) => {
        if (confirm('Are you sure you want to remove this token from your local storage?')) {
            TokenStorage.removeToken(address);
            setTokens(getAllTokens());
        }
    };

    if (loading) {
        return (
            <div className="flex-1 p-8">
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <Spinner size={32} className="mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading your tokens...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!loading && tokens.length === 0) return null;

    return (
        <div className="flex-1 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Your Tokens</h2>
                        <p className="text-muted-foreground">
                            Manage your created tokens and their extensions ({getTokenCount()} total)
                        </p>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create New Token
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/create/stablecoin">
                                    <Coins className="h-4 w-4 mr-2" />
                                    Stablecoin
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/create/arcade-token">
                                    <Coins className="h-4 w-4 mr-2" />
                                    Arcade Token
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/create/tokenized-security">
                                    <Coins className="h-4 w-4 mr-2" />
                                    Tokenized Security
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/import">
                                    <Upload className="h-4 w-4 mr-2" />
                                    Import Existing Token
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tokens.map((token, index) => (
                        <TokenCard key={index} token={token} index={index} onDelete={handleDeleteToken} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function DashboardDisconnected() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold mb-4">Welcome to Mosaic</h2>
                <p className="mb-6">Please connect your Solana wallet to access the dashboard.</p>
            </div>
        </div>
    );
}
