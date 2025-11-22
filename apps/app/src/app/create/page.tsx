'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useConnector } from '@solana/connector/react';
import { DashboardEmptyState } from '../components/dashboard-empty-state';

export default function CreatePage() {
    const { connected } = useConnector();
    const router = useRouter();

    useEffect(() => {
        // Redirect to home if not connected
        if (!connected) {
            router.push('/');
        }
    }, [connected, router]);

    // Don't render anything while redirecting
    if (!connected) {
        return null;
    }

    return <DashboardEmptyState />;
}
