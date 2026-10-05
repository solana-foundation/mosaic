import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ShieldCheck, Users } from 'lucide-react';
import { isAddress } from '@solana/kit';
import type { ConfidentialPolicy } from '@/types/token';
import { cn } from '@/lib/utils';

/**
 * The subset of a creation form's options this card reads.
 *
 * Structural rather than tied to one options type, because the same card is rendered by the
 * Custom Token Configuration step and by the Stablecoin / Tokenized Security Features steps.
 */
export interface ConfidentialBalancesConfigOptions {
    confidentialBalancesPolicy?: ConfidentialPolicy;
    auditorElgamalPubkey?: string;
}

/**
 * True when an auditor ElGamal pubkey has been typed but isn't a valid address.
 *
 * Takes the raw string rather than an options object so the three forms can share it: the
 * templates carry Confidential Balances unconditionally and have no `enableConfidentialBalances`
 * flag to gate on. Callers that *do* have one should check it themselves.
 *
 * Note this only validates the base58/32-byte shape. A valid ElGamal pubkey is a compressed
 * Ristretto point, and neither this nor the SDK checks that it is on the curve, so an ordinary
 * wallet address will pass.
 */
export function isAuditorKeyInvalid(raw: string | undefined): boolean {
    const value = raw?.trim() || '';
    return value.length > 0 && !isAddress(value);
}

interface ConfidentialBalancesConfigProps {
    /** Prefixes the DOM id so two instances could coexist. */
    idPrefix: string;
    options: ConfidentialBalancesConfigOptions;
    onInputChange: (field: string, value: string | boolean) => void;
}

/**
 * Confidential Balances approve policy + optional auditor key.
 *
 * The default is `'whitelist'`, which matches the SDK — but it leaves the extension gated so the
 * authority must approve every account, and this app has no approve action. That combination is
 * unusable, so the card says so rather than letting the default look fine.
 */
export function ConfidentialBalancesConfig({ idPrefix, options, onInputChange }: ConfidentialBalancesConfigProps) {
    const policy = options.confidentialBalancesPolicy || 'whitelist';
    const auditorKeyInvalid = isAuditorKeyInvalid(options.auditorElgamalPubkey);
    const auditorInputId = `${idPrefix}-auditorElgamalPubkey`;

    return (
        <Card className="py-4">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div>
                        <CardTitle className="text-base">Confidential Balances</CardTitle>
                        <CardDescription className="text-xs">
                            Choose how holders get access to encrypted balances
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => onInputChange('confidentialBalancesPolicy', 'whitelist')}
                        className={cn(
                            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                            policy === 'whitelist'
                                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50',
                        )}
                    >
                        <ShieldCheck
                            className={cn('h-6 w-6', policy === 'whitelist' ? 'text-primary' : 'text-muted-foreground')}
                        />
                        <div className="text-center">
                            <p className="text-sm font-medium">Approval required</p>
                            <p className="text-xs text-muted-foreground">
                                You approve each account before it can use confidential balances
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => onInputChange('confidentialBalancesPolicy', 'opt-in')}
                        className={cn(
                            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer',
                            policy === 'opt-in'
                                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50',
                        )}
                    >
                        <Users
                            className={cn('h-6 w-6', policy === 'opt-in' ? 'text-primary' : 'text-muted-foreground')}
                        />
                        <div className="text-center">
                            <p className="text-sm font-medium">Opt-in</p>
                            <p className="text-xs text-muted-foreground">
                                Any holder can enable confidential balances themselves
                            </p>
                        </div>
                    </button>
                </div>
                {policy === 'whitelist' && (
                    <Alert variant="warning" className="border-amber-500/50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <p className="text-xs">
                                Holders cannot enable confidential balances themselves, and this app has no approve
                                action yet — so nobody will be able to use the feature on this token. Choose{' '}
                                <strong>Opt-in</strong> unless you intend to approve accounts with the SDK or CLI.
                            </p>
                        </AlertDescription>
                    </Alert>
                )}
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                        <Label htmlFor={auditorInputId} className="text-xs text-muted-foreground">
                            Auditor ElGamal Public Key (optional)
                        </Label>
                        <Input
                            id={auditorInputId}
                            type="text"
                            placeholder="Leave empty for no auditor"
                            value={options.auditorElgamalPubkey || ''}
                            aria-invalid={auditorKeyInvalid}
                            onChange={e => onInputChange('auditorElgamalPubkey', e.target.value)}
                            className={cn(auditorKeyInvalid && 'border-destructive focus-visible:ring-destructive')}
                        />
                        {auditorKeyInvalid ? (
                            <p role="alert" className="text-xs text-destructive">
                                Not a valid ElGamal public key
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                An auditor can decrypt every confidential transfer amount on this token. This cannot be
                                changed after creation.
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
