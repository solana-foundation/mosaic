'use client';

import { useState } from 'react';
import { computeVaultAllocation, DEFAULT_ALLOCATION_RULES, DEFAULT_YIELD_SOURCES, apyBpsToString, blendedApyBps, allocateToYieldSources } from '@solana/mosaic-sdk';
import { VaultAllocationDisplay } from './vault-allocation-display';
import { CompliancePanel } from './compliance-panel';
import { YieldSourcesPanel } from './yield-sources-panel';
import { CrossBorderSimulator } from './cross-border-simulator';
import { TrendingUp, Shield, Globe2, Landmark, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

const DECIMALS = 6;
const DEMO_BALANCE = 1_000_000 * 10 ** DECIMALS; // $1M

export function VaultDashboard() {
    const [yieldFarm, setYieldFarm] = useState(DEFAULT_ALLOCATION_RULES.yieldFarm);
    const [reserve, setReserve] = useState(DEFAULT_ALLOCATION_RULES.reserve);
    const [crossBorder, setCrossBorder] = useState(DEFAULT_ALLOCATION_RULES.crossBorder);
    const [activeTab, setActiveTab] = useState<'overview' | 'compliance' | 'yield' | 'cross-border'>('overview');

    const sumOk = yieldFarm + reserve + crossBorder === 100;
    const allocation = sumOk
        ? computeVaultAllocation(BigInt(DEMO_BALANCE), { yieldFarm, reserve, crossBorder }, DEFAULT_YIELD_SOURCES)
        : computeVaultAllocation(BigInt(DEMO_BALANCE), DEFAULT_ALLOCATION_RULES, DEFAULT_YIELD_SOURCES);

    const yieldAllocs = allocateToYieldSources(allocation.yieldFarmAmount, DEFAULT_YIELD_SOURCES);
    const blended = blendedApyBps(yieldAllocs, allocation.yieldFarmAmount);
    const annualYield = (Number(allocation.yieldFarmAmount) / 10 ** DECIMALS) * (blended / 10000);

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Landmark },
        { id: 'compliance', label: 'Compliance', icon: Shield },
        { id: 'yield', label: 'Yield Sources', icon: TrendingUp },
        { id: 'cross-border', label: 'Cross-Border', icon: Globe2 },
    ] as const;

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Landmark className="h-6 w-6 text-teal-600" />
                        <h1 className="text-2xl font-bold">Treasury Vault</h1>
                    </div>
                    <p className="text-muted-foreground text-sm max-w-xl">
                        Compliant yield-enabled institutional vault. Deposits auto-route to DeFi yield sources with
                        KYC gating, KYT screening, Travel Rule compliance, and cross-border instant settlement.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
                        <ArrowDownToLine className="h-4 w-4" />
                        Deposit
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">
                        <ArrowUpFromLine className="h-4 w-4" />
                        Withdraw
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total Deposited', value: '$1,000,000', sub: 'demo balance', color: 'text-foreground' },
                    { label: 'Est. Annual Yield', value: `$${annualYield.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, sub: `${apyBpsToString(Math.round(blended))} blended APY`, color: 'text-teal-600' },
                    { label: 'Active Yield Sources', value: '4', sub: 'Solstice · Kamino · Drift · RWA', color: 'text-foreground' },
                    { label: 'Compliance', value: '5/5', sub: 'checks active', color: 'text-green-600' },
                ].map(stat => (
                    <div key={stat.label} className="rounded-lg border p-4 space-y-1">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.sub}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="border-b">
                <div className="flex gap-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-teal-600 text-teal-600'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">Allocation Rules</h2>
                            {!sumOk && (
                                <span className="text-xs text-red-500">Percentages must sum to 100 (currently {yieldFarm + reserve + crossBorder})</span>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'Yield Farm %', value: yieldFarm, setter: setYieldFarm, color: 'text-teal-600' },
                                { label: 'Reserve %', value: reserve, setter: setReserve, color: 'text-slate-600' },
                                { label: 'Cross-Border %', value: crossBorder, setter: setCrossBorder, color: 'text-blue-600' },
                            ].map(({ label, value, setter, color }) => (
                                <div key={label} className="flex flex-col gap-1">
                                    <label className={`text-xs font-medium ${color}`}>{label}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={value}
                                        onChange={e => setter(parseInt(e.target.value, 10) || 0)}
                                        className="rounded-md border px-3 py-2 text-sm bg-background"
                                    />
                                </div>
                            ))}
                        </div>
                        {sumOk && <VaultAllocationDisplay allocation={allocation} decimals={DECIMALS} />}
                    </div>

                    {/* Extensions used */}
                    <div className="rounded-lg border p-4 space-y-3">
                        <h2 className="font-semibold">Token-2022 Extensions Active</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                                { name: 'Transfer Hook', desc: 'KYT on every transfer', badge: 'teal' },
                                { name: 'Transfer Fee', desc: '5 bps → reserve', badge: 'slate' },
                                { name: 'Pausable', desc: 'Emergency stop', badge: 'orange' },
                                { name: 'Default Acct State', desc: 'Frozen (KYC required)', badge: 'blue' },
                                { name: 'Permanent Delegate', desc: 'Regulatory seize', badge: 'red' },
                                { name: 'Metadata', desc: 'On-chain vault config', badge: 'purple' },
                            ].map(ext => (
                                <div key={ext.name} className="rounded-md border p-2 space-y-0.5">
                                    <p className="text-xs font-medium">{ext.name}</p>
                                    <p className="text-xs text-muted-foreground">{ext.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'compliance' && (
                <div className="rounded-lg border p-4 space-y-3">
                    <div>
                        <h2 className="font-semibold">Compliance Stack</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">All checks enforced at the Token-2022 protocol level.</p>
                    </div>
                    <CompliancePanel />
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400">
                        <strong>Production note:</strong> KYT hook and KYC PDAs are simulated. Deploy the transfer hook
                        program and integrate a KYC provider (Sumsub, Jumio) for production compliance.
                    </div>
                </div>
            )}

            {activeTab === 'yield' && (
                <div className="rounded-lg border p-4 space-y-3">
                    <div>
                        <h2 className="font-semibold">Yield Sources</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Funds in the yield tranche are split proportionally by APY.</p>
                    </div>
                    <YieldSourcesPanel />
                </div>
            )}

            {activeTab === 'cross-border' && (
                <div className="rounded-lg border p-4 space-y-3">
                    <div>
                        <h2 className="font-semibold">Cross-Border Transfer Simulator</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Preview FX conversion, settlement time, and Travel Rule memo for a transfer.
                        </p>
                    </div>
                    <CrossBorderSimulator />
                </div>
            )}
        </div>
    );
}
