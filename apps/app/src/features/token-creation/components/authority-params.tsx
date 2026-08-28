'use client';

import { useId, useState } from 'react';
import { isAddress } from '@solana/kit';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One editable authority row.
 *
 * `key` is constrained to the option type's own keys so a typo can't silently write a dead
 * field through the stringly-typed `onInputChange`.
 */
export interface AuthorityField<TOptions> {
    key: Extract<keyof TOptions, string>;
    label: string;
    /** Shown under the input; use it to explain what the authority can do. */
    help?: string;
    /** Renders the field read-only. Pair with `disabledReason`. */
    disabled?: boolean;
    disabledReason?: string;
}

interface AuthorityParamsProps<TOptions> {
    /** Prefixes the DOM ids so two instances can coexist. */
    idPrefix: string;
    options: TOptions;
    fields: AuthorityField<TOptions>[];
    onInputChange: (field: string, value: string | boolean) => void;
    /** Skip the collapsible header and render expanded. */
    alwaysExpanded?: boolean;
}

/** True when any enabled field holds a non-empty value that isn't a valid address. */
export function hasInvalidAuthority<TOptions>(options: TOptions, fields: AuthorityField<TOptions>[]): boolean {
    return fields.some(field => {
        if (field.disabled) return false;
        const raw = String(options[field.key] ?? '').trim();
        return raw.length > 0 && !isAddress(raw);
    });
}

/**
 * Authority override inputs, shared by all four creation forms.
 *
 * Every field is optional — an empty input leaves the authority defaulted to the connected
 * wallet by the SDK, which is why the placeholder says so explicitly rather than implying
 * "none".
 */
export function AuthorityParams<TOptions>({
    idPrefix,
    options,
    fields,
    onInputChange,
    alwaysExpanded = false,
}: AuthorityParamsProps<TOptions>) {
    const [showOptionalParams, setShowOptionalParams] = useState(alwaysExpanded);
    const isExpanded = alwaysExpanded || showOptionalParams;
    const contentId = `${idPrefix}-authority-params`;

    const header = (
        <div>
            <h3 className="text-lg font-semibold">Authority Parameters (Optional)</h3>
            <p className="text-sm text-muted-foreground">
                Configure authorities for advanced token management. Leave empty to use the connected wallet.
            </p>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                {alwaysExpanded ? (
                    header
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowOptionalParams(!showOptionalParams)}
                        aria-controls={contentId}
                        aria-expanded={showOptionalParams}
                        className="flex items-center gap-2 text-left"
                        title={showOptionalParams ? 'Collapse' : 'Expand'}
                    >
                        <ChevronRight
                            className={cn(
                                'mt-1 h-4 w-4 text-muted-foreground transition-transform',
                                showOptionalParams && 'rotate-90',
                            )}
                        />
                        {header}
                    </button>
                )}
            </CardHeader>
            {isExpanded && (
                <CardContent id={contentId} className="space-y-4">
                    {fields.map(field => (
                        <AuthorityInput
                            key={field.key}
                            idPrefix={idPrefix}
                            field={field}
                            value={String(options[field.key] ?? '')}
                            onInputChange={onInputChange}
                        />
                    ))}
                </CardContent>
            )}
        </Card>
    );
}

function AuthorityInput<TOptions>({
    idPrefix,
    field,
    value,
    onInputChange,
}: {
    idPrefix: string;
    field: AuthorityField<TOptions>;
    value: string;
    onInputChange: (field: string, value: string | boolean) => void;
}) {
    const errorId = useId();
    const inputId = `${idPrefix}-${field.key}`;
    const trimmed = value.trim();
    const isInvalid = !field.disabled && trimmed.length > 0 && !isAddress(trimmed);

    return (
        <div className="space-y-2">
            <Label htmlFor={inputId}>{field.label}</Label>
            <Input
                id={inputId}
                type="text"
                disabled={field.disabled}
                placeholder={field.disabled ? 'Set automatically' : 'Public key or leave empty for connected wallet'}
                value={value}
                aria-invalid={isInvalid}
                aria-describedby={isInvalid ? errorId : undefined}
                onChange={e => onInputChange(field.key, e.target.value)}
                className={cn(isInvalid && 'border-destructive focus-visible:ring-destructive')}
            />
            {isInvalid && (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                    Not a valid Solana address
                </p>
            )}
            {field.disabled && field.disabledReason && (
                <p className="text-xs text-muted-foreground">{field.disabledReason}</p>
            )}
            {!field.disabled && field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
        </div>
    );
}
