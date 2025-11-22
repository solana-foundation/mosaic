'use client';

import { useEffect, useState } from 'react';
import { useConnector } from '@solana/connector/react';
import { Spinner } from '@/components/ui/spinner';
import { DashboardConnected } from './components/dashboard-connected';
import { DashboardDisconnected } from './components/dashboard-disconnected';

export default function DashboardPage() {
    const { connected, selectedAccount, connecting } = useConnector();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        if (connected || connecting) {
            setIsInitializing(false);
            return;
        }

        const recentWallet = localStorage.getItem('recentlyConnectedWallet');
        if (!recentWallet) {
            setIsInitializing(false);
            return;
        }

        const timer = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, [connected, connecting]);

    if (connecting || (isInitializing && !connected)) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <Spinner size={32} />
            </div>
        );
    }

    return connected && selectedAccount ? <DashboardConnected /> : <DashboardDisconnected />;
}
