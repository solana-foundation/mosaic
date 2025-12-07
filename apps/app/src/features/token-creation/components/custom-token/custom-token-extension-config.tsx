import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertTriangle,
    ShieldCheck,
    ShieldX,
    Lock,
    CalendarClock,
    RefreshCw,
    Info,
} from 'lucide-react';
import { CustomTokenOptions } from '@/types/token';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface CustomTokenExtensionConfigProps {
    options: CustomTokenOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

export function CustomTokenExtensionConfig({ options, onInputChange }: CustomTokenExtensionConfigProps) {
    const [scheduleFirstRebase, setScheduleFirstRebase] = useState(false);

    // Scaled UI Amount calculations
    const mode = options.scaledUiAmountMode || 'static';
    const multiplier = parseFloat(options.scaledUiAmountMultiplier || '1') || 1;
    const newMultiplier = parseFloat(options.scaledUiAmountNewMultiplier || '1') || 1;

    // Transfer Fee calculations
    const decimals = parseInt(options.decimals || '6', 10) || 6;
    const transferFeeBasisPoints = parseInt(options.transferFeeBasisPoints || '0', 10) || 0;
    const transferFeeMaximum = options.transferFeeMaximum ? BigInt(options.transferFeeMaximum) : 0n;
    const transferFeeMaximumDisplay = transferFeeMaximum > 0n 
        ? (Number(transferFeeMaximum) / Math.pow(10, decimals)).toLocaleString()
        : '0';
    const transferFeePreview = (() => {
        const amount = 1000;
        const feePercent = transferFeeBasisPoints / 10000;
        let fee = amount * feePercent;
        const maxFeeInTokens = Number(transferFeeMaximum) / Math.pow(10, decimals);
        if (transferFeeMaximum > 0n && fee > maxFeeInTokens) {
            fee = maxFeeInTokens;
        }
        return {
            fee: Math.round(fee * 1000) / 1000,
            received: Math.round((amount - fee) * 1000) / 1000,
        };
    })();

    // Interest Bearing calculations
    const interestRate = parseInt(options.interestRate || '0', 10) || 0;
    const interestRatePercent = interestRate / 100;
    const interestPreview = (() => {
        const principal = 1000;
        // Continuous compounding: A = P * e^(rt)
        const after1Year = principal * Math.exp(interestRatePercent / 100);
        const after5Years = principal * Math.exp((interestRatePercent / 100) * 5);
        return {
            after1Year: Math.round(after1Year * 100) / 100,
            after5Years: Math.round(after5Years * 100) / 100,
            growth1Year: Math.round((after1Year - principal) * 100) / 100,
        };
    })();

    return (
        <div className="space-y-4">
            {/* Scaled UI Amount Configuration */}
            {options.enableScaledUiAmount && (
                <Card className="py-4">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div>
                                <CardTitle className="text-base">Scaled UI Amount</CardTitle>
                                <CardDescription className="text-xs">
                                    Configure how token amounts are displayed
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Mode Selector Cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => onInputChange('scaledUiAmountMode', 'static')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer',
                                    mode === 'static'
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                )}
                            >
                                <Lock
                                    className={cn(
                                        'h-5 w-5',
                                        mode === 'static' ? 'text-primary' : 'text-muted-foreground'
                                    )}
                                />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Static</p>
                                    <p className="text-xs text-muted-foreground">Fixed multiplier</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onInputChange('scaledUiAmountMode', 'scheduled')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer',
                                    mode === 'scheduled'
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                )}
                            >
                                <CalendarClock
                                    className={cn(
                                        'h-5 w-5',
                                        mode === 'scheduled' ? 'text-primary' : 'text-muted-foreground'
                                    )}
                                />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Scheduled</p>
                                    <p className="text-xs text-muted-foreground">Plan a change</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onInputChange('scaledUiAmountMode', 'rebasing')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer',
                                    mode === 'rebasing'
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                )}
                            >
                                <RefreshCw
                                    className={cn(
                                        'h-5 w-5',
                                        mode === 'rebasing' ? 'text-primary' : 'text-muted-foreground'
                                    )}
                                />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Rebasing</p>
                                    <p className="text-xs text-muted-foreground">Updates over time</p>
                                </div>
                            </button>
                        </div>

                        {/* Static Mode Config */}
                        {mode === 'static' && (
                            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                                <div className="space-y-1">
                                    <Label htmlFor="scaledUiAmountMultiplier" className="text-xs text-muted-foreground">
                                        Display Multiplier
                                    </Label>
                                    <Input
                                        id="scaledUiAmountMultiplier"
                                        type="number"
                                        placeholder="1"
                                        value={options.scaledUiAmountMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountMultiplier', e.target.value)}
                                        min={0.000001}
                                        step={0.000001}
                                    />
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Info className="h-4 w-4" />
                                    <span>
                                        Preview: 1,000 tokens × {multiplier} = {(1000 * multiplier).toLocaleString()} displayed
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Scheduled Change Mode Config */}
                        {mode === 'scheduled' && (
                            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="scaledUiAmountMultiplier" className="text-xs text-muted-foreground">
                                            Current Multiplier
                                        </Label>
                                        <Input
                                            id="scaledUiAmountMultiplier"
                                            type="number"
                                            placeholder="1"
                                            value={options.scaledUiAmountMultiplier || ''}
                                            onChange={e => onInputChange('scaledUiAmountMultiplier', e.target.value)}
                                            min={0.000001}
                                            step={0.000001}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="scaledUiAmountNewMultiplier" className="text-xs text-muted-foreground">
                                            New Multiplier
                                        </Label>
                                        <Input
                                            id="scaledUiAmountNewMultiplier"
                                            type="number"
                                            placeholder="2"
                                            value={options.scaledUiAmountNewMultiplier || ''}
                                            onChange={e => onInputChange('scaledUiAmountNewMultiplier', e.target.value)}
                                            min={0.000001}
                                            step={0.000001}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="scaledUiAmountEffectiveTimestamp" className="text-xs text-muted-foreground">
                                        Effective Date & Time (UTC)
                                    </Label>
                                    <Input
                                        id="scaledUiAmountEffectiveTimestamp"
                                        type="datetime-local"
                                        value={options.scaledUiAmountEffectiveTimestamp || ''}
                                        onChange={e => onInputChange('scaledUiAmountEffectiveTimestamp', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Info className="h-4 w-4 shrink-0" />
                                        <span>Preview for 1,000 tokens:</span>
                                    </div>
                                    <div className="ml-6 space-y-0.5">
                                        <p>Before: {(1000 * multiplier).toLocaleString()} displayed</p>
                                        <p>After: {(1000 * newMultiplier).toLocaleString()} displayed</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Rebasing Mode Config */}
                        {mode === 'rebasing' && (
                            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                                <div className="space-y-1">
                                    <Label htmlFor="scaledUiAmountMultiplier" className="text-xs text-muted-foreground">
                                        Initial Multiplier
                                    </Label>
                                    <Input
                                        id="scaledUiAmountMultiplier"
                                        type="number"
                                        placeholder="1"
                                        value={options.scaledUiAmountMultiplier || ''}
                                        onChange={e => onInputChange('scaledUiAmountMultiplier', e.target.value)}
                                        min={0.000001}
                                        step={0.000001}
                                    />
                                </div>

                                <Alert variant="warning" className="border-amber-500/50">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        <p className="text-xs">
                                            Rebasing requires external coordination. The multiplier authority will need to call updateMultiplier separately, or use a cron job to call the function periodically.
                                        </p>
                                    </AlertDescription>
                                </Alert>

                                {/* Optional: Schedule first rebase */}
                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <Checkbox
                                            checked={scheduleFirstRebase}
                                            onCheckedChange={checked => {
                                                setScheduleFirstRebase(!!checked);
                                                if (!checked) {
                                                    onInputChange(
                                                        'scaledUiAmountNewMultiplier',
                                                        options.scaledUiAmountMultiplier || '1'
                                                    );
                                                    onInputChange('scaledUiAmountEffectiveTimestamp', '');
                                                }
                                            }}
                                        />
                                        <span className="text-sm">Schedule first rebase</span>
                                    </label>

                                    {scheduleFirstRebase && (
                                        <div className="space-y-3 ml-6 pl-3 border-l-2 border-muted">
                                            <div className="space-y-1">
                                                <Label
                                                    htmlFor="scaledUiAmountNewMultiplier"
                                                    className="text-xs text-muted-foreground"
                                                >
                                                    First Rebase Multiplier
                                                </Label>
                                                <Input
                                                    id="scaledUiAmountNewMultiplier"
                                                    type="number"
                                                    placeholder="1.05"
                                                    value={options.scaledUiAmountNewMultiplier || ''}
                                                    onChange={e =>
                                                        onInputChange('scaledUiAmountNewMultiplier', e.target.value)
                                                    }
                                                    min={0.000001}
                                                    step={0.000001}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label
                                                    htmlFor="scaledUiAmountEffectiveTimestamp"
                                                    className="text-xs text-muted-foreground"
                                                >
                                                    Effective Date & Time (UTC)
                                                </Label>
                                                <Input
                                                    id="scaledUiAmountEffectiveTimestamp"
                                                    type="datetime-local"
                                                    value={options.scaledUiAmountEffectiveTimestamp || ''}
                                                    onChange={e =>
                                                        onInputChange('scaledUiAmountEffectiveTimestamp', e.target.value)
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* SRFC-37 Configuration */}
            {options.enableSrfc37 && (
                <Card className="py-4">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div>
                                <CardTitle className="text-base">SRFC-37 Access Control</CardTitle>
                                <CardDescription className="text-xs">
                                    Configure transfer restrictions
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => onInputChange('aclMode', 'allowlist')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                                    options.aclMode === 'allowlist'
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                )}
                            >
                                <ShieldCheck
                                    className={cn(
                                        'h-6 w-6',
                                        options.aclMode === 'allowlist' ? 'text-primary' : 'text-muted-foreground'
                                    )}
                                />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Allowlist</p>
                                    <p className="text-xs text-muted-foreground">Only approved addresses can transfer</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onInputChange('aclMode', 'blocklist')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                                    options.aclMode === 'blocklist' || !options.aclMode
                                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                )}
                            >
                                <ShieldX
                                    className={cn(
                                        'h-6 w-6',
                                        options.aclMode === 'blocklist' || !options.aclMode
                                            ? 'text-primary'
                                            : 'text-muted-foreground'
                                    )}
                                />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Blocklist</p>
                                    <p className="text-xs text-muted-foreground">Block specific addresses from transfers</p>
                                </div>
                            </button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Transfer Fee Configuration */}
            {options.enableTransferFee && (
                <Card className="py-4">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div>
                                <CardTitle className="text-base">Transfer Fee</CardTitle>
                                <CardDescription className="text-xs">
                                    Automatically deduct a fee from every token transfer
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Fee Preset Buttons */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Quick Select Fee Rate</Label>
                            <div className="grid grid-cols-5 gap-2">
                                {[
                                    { label: '0.1%', value: '10' },
                                    { label: '0.5%', value: '50' },
                                    { label: '1%', value: '100' },
                                    { label: '2%', value: '200' },
                                    { label: '5%', value: '500' },
                                ].map(preset => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => onInputChange('transferFeeBasisPoints', preset.value)}
                                        className={cn(
                                            'px-3 py-2 text-sm rounded-md border transition-all',
                                            options.transferFeeBasisPoints === preset.value
                                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="transferFeeBasisPoints" className="text-xs text-muted-foreground">
                                        Fee Rate (basis points)
                                    </Label>
                                    <Input
                                        id="transferFeeBasisPoints"
                                        type="number"
                                        min="0"
                                        max="10000"
                                        placeholder="100"
                                        value={options.transferFeeBasisPoints || ''}
                                        onChange={e => onInputChange('transferFeeBasisPoints', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {transferFeeBasisPoints > 0 ? `${(transferFeeBasisPoints / 100).toFixed(2)}%` : '0%'} per transfer
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="transferFeeMaximum" className="text-xs text-muted-foreground">
                                        Maximum Fee Cap
                                    </Label>
                                    <Input
                                        id="transferFeeMaximum"
                                        type="text"
                                        placeholder="1000000"
                                        value={options.transferFeeMaximum || ''}
                                        onChange={e => onInputChange('transferFeeMaximum', e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        In smallest units (with {decimals} decimals = {transferFeeMaximumDisplay} tokens max)
                                    </p>
                                </div>
                            </div>

                            {/* Live Preview */}
                            <div className="space-y-2 pt-2 border-t border-border/50">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Info className="h-4 w-4 shrink-0" />
                                    <span>Transfer Preview (1,000 tokens):</span>
                                </div>
                                <div className="ml-6 grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <p className="text-muted-foreground text-xs">Fee</p>
                                        <p className="font-medium">{transferFeePreview.fee.toLocaleString()} tokens</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Recipient Gets</p>
                                        <p className="font-medium text-green-600">{transferFeePreview.received.toLocaleString()} tokens</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Fee Withheld</p>
                                        <p className="font-medium text-amber-600">{transferFeePreview.fee.toLocaleString()} tokens</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Alert variant="warning" className="border-amber-500/50">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                <p className="text-xs">
                                    <strong>Important:</strong> Fee configuration changes take ~4 days (2 epochs) to become effective. 
                                    Fees accumulate in recipient accounts and must be harvested by the withdraw authority.
                                </p>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}

            {/* Interest Bearing Configuration */}
            {options.enableInterestBearing && (
                <Card className="py-4">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div>
                                <CardTitle className="text-base">Interest Bearing</CardTitle>
                                <CardDescription className="text-xs">
                                    Tokens display accrued interest over time (cosmetic)
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Interest Rate Preset Buttons */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Quick Select Annual Rate</Label>
                            <div className="grid grid-cols-5 gap-2">
                                {[
                                    { label: '1%', value: '100' },
                                    { label: '3%', value: '300' },
                                    { label: '5%', value: '500' },
                                    { label: '8%', value: '800' },
                                    { label: '10%', value: '1000' },
                                ].map(preset => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => onInputChange('interestRate', preset.value)}
                                        className={cn(
                                            'px-3 py-2 text-sm rounded-md border transition-all',
                                            options.interestRate === preset.value
                                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div className="space-y-1">
                                <Label htmlFor="interestRate" className="text-xs text-muted-foreground">
                                    Annual Interest Rate (basis points)
                                </Label>
                                <Input
                                    id="interestRate"
                                    type="number"
                                    min="0"
                                    placeholder="500"
                                    value={options.interestRate || ''}
                                    onChange={e => onInputChange('interestRate', e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {interestRatePercent > 0 ? `${interestRatePercent.toFixed(2)}%` : '0%'} annual rate (continuously compounded)
                                </p>
                            </div>

                            {/* Interest Preview */}
                            {interestRate > 0 && (
                                <div className="space-y-2 pt-2 border-t border-border/50">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Info className="h-4 w-4 shrink-0" />
                                        <span>Display Preview (starting with 1,000 tokens):</span>
                                    </div>
                                    <div className="ml-6 grid grid-cols-3 gap-2 text-sm">
                                        <div>
                                            <p className="text-muted-foreground text-xs">After 1 Year</p>
                                            <p className="font-medium">{interestPreview.after1Year.toLocaleString()}</p>
                                            <p className="text-xs text-green-600">+{interestPreview.growth1Year.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">After 5 Years</p>
                                            <p className="font-medium">{interestPreview.after5Years.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Actual Balance</p>
                                            <p className="font-medium">1,000</p>
                                            <p className="text-xs text-muted-foreground">unchanged</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                            <Info className="h-4 w-4 text-blue-600" />
                            <AlertDescription>
                                <p className="text-xs text-blue-800 dark:text-blue-200">
                                    <strong>Display Only:</strong> Interest is calculated on-chain but shown cosmetically. 
                                    No new tokens are minted — the actual token balance remains unchanged. 
                                    The authority can update the rate at any time.
                                </p>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}

            {/* Transfer Hook Configuration */}
            {options.enableTransferHook && (
                <Card className="py-4">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div>
                                <CardTitle className="text-base">Transfer Hook</CardTitle>
                                <CardDescription className="text-xs">
                                    Configure custom program execution on transfers
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div className="space-y-1">
                                <Label htmlFor="transferHookProgramId" className="text-xs text-muted-foreground flex items-center gap-1">
                                    Hook Program ID
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="transferHookProgramId"
                                    type="text"
                                    placeholder="Enter the program address..."
                                    value={options.transferHookProgramId || ''}
                                    onChange={e => onInputChange('transferHookProgramId', e.target.value)}
                                    className={cn(
                                        !options.transferHookProgramId?.trim() && 'border-destructive focus-visible:ring-destructive'
                                    )}
                                />
                                {!options.transferHookProgramId?.trim() && (
                                    <p className="text-xs text-destructive">
                                        A valid program address is required to create a token with Transfer Hook
                                    </p>
                                )}
                            </div>
                        </div>
                        <Alert variant="warning" className="border-amber-500/50">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                <p className="text-xs">
                                    Transfer hooks require a deployed program that implements the transfer hook interface. 
                                    The program must be deployed before creating the token.
                                </p>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
