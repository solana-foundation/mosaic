"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export default function DashboardPage() {
    const { connected, publicKey } = useWallet();
    const [walletConnected, setWalletConnected] = useState(false);

    useEffect(() => {
        setWalletConnected(connected && !!publicKey);
    }, [connected, publicKey]);

    return walletConnected ? <DashboardConnected /> : <DashboardDisconnected />;
}

function DashboardConnected() {
    return (
        <div className="flex-1 p-8">
            <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
            <p>Welcome! Your wallet is connected. Here is your dashboard.</p>
        </div>
    );
}

function DashboardDisconnected() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="mb-6">Please connect your Solana wallet to access the dashboard.</p>
        </div>
    );
}
