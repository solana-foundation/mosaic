"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Coins } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
    const { connected, publicKey } = useWallet();
    const [walletConnected, setWalletConnected] = useState(false);

    useEffect(() => {
        setWalletConnected(connected && !!publicKey);
    }, [connected, publicKey]);

    return walletConnected && publicKey ? <DashboardConnected publicKey={publicKey.toBase58()}/> : <DashboardDisconnected />;
}

function DashboardConnected({ publicKey } : { publicKey: string }) {
    // Placeholder: Replace with actual token fetching logic
    const [tokens, setTokens] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate loading tokens
        setTimeout(() => {
            // Placeholder: Replace with actual token fetching
            setTokens([]); // Empty array for "no tokens" state
            setLoading(false);
        }, 1000);
    }, []);

    if (loading) {
        return (
            <div className="flex-1 p-8">
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading your tokens...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (tokens.length === 0) {
        return (
            <div className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-bold mb-4">Welcome to Mosaic</h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            Create your first token to get started with tokenization on Solana
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <Card className="h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center">
                                    <Coins className="h-8 w-8 text-primary mr-3" />
                                    <CardTitle>Stablecoin</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <CardDescription>
                                    Create a regulatory-compliant stablecoin with transfer restrictions and metadata management.
                                </CardDescription>
                            </CardContent>
                            <CardFooter>
                                <Link href="/dashboard/create/stablecoin" className="w-full">
                                    <Button className="w-full">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Stablecoin
                                    </Button>
                                </Link>
                            </CardFooter>
                        </Card>
                        
                        <Card className="h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center">
                                    <Coins className="h-8 w-8 text-primary mr-3" />
                                    <CardTitle>Arcade Token</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <CardDescription>
                                    Deploy a gaming or utility token with custom extensions and features.
                                </CardDescription>
                            </CardContent>
                            <CardFooter>
                                <Link href="/dashboard/create/arcade-token" className="w-full">
                                    <Button className="w-full">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Arcade Token
                                    </Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    </div>
                    
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">
                            Public Key: {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Your Tokens</h2>
                        <p className="text-muted-foreground">
                            Manage your created tokens and their extensions
                        </p>
                    </div>
                    <Link href="/create">
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Create New Token
                        </Button>
                    </Link>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tokens.map((token, index) => (
                        <Card key={index} className="h-full flex flex-col">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <Coins className="h-6 w-6 text-primary mr-3" />
                                        <div>
                                            <CardTitle className="text-lg">{token.name || `Token ${index + 1}`}</CardTitle>
                                            <CardDescription>{token.symbol || 'TKN'}</CardDescription>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Supply:</span>
                                        <span>{token.supply || '1,000,000'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type:</span>
                                        <span>{token.type || 'Standard'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Status:</span>
                                        <span className="text-green-600">Active</span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Link href={`/manage/${token.address || index}`} className="w-full">
                                    <Button variant="outline" className="w-full">
                                        <Settings className="h-4 w-4 mr-2" />
                                        Manage
                                    </Button>
                                </Link>
                            </CardFooter>
                        </Card>
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
