import type { AuthorityField } from './authority-params';
import type {
    ArcadeTokenOptions,
    CustomTokenOptions,
    StablecoinOptions,
    TokenizedSecurityOptions,
} from '@/types/token';

/**
 * The authority fields each creation form exposes.
 *
 * Two rules are encoded here rather than in the forms, so the rendered inputs and the
 * `canProceed` validation can never disagree:
 *
 * 1. **Freeze authority is ignored on the sRFC-37 path.** Token-ACL's `create_config`
 *    requires the mint's freeze authority to equal the mint authority, then reassigns it to
 *    the config PDA, so every template overrides whatever the caller passed. The field is
 *    rendered disabled with an explanation instead of silently discarding input.
 * 2. **Mint authority is not editable while TokenMetadata is present.** The SDK throws
 *    (`mintAuthority must be a TransactionSigner<string> ... when TokenMetadata extension is
 *    present`) for any address that isn't the signing wallet. Metadata is unconditional on
 *    the three templates, so they expose no mint-authority field at all; the custom form
 *    exposes it only when metadata is switched off.
 */

const FREEZE_AUTHORITY_SRFC37_REASON =
    'sRFC-37 requires the mint authority to be the freeze authority at creation; it is then handed to the Token-ACL config account.';

const freezeAuthorityField = <T extends { freezeAuthority?: string }>(
    enableSrfc37: boolean | undefined,
): AuthorityField<T> => ({
    key: 'freezeAuthority' as Extract<keyof T, string>,
    label: 'Freeze Authority',
    help: 'Can freeze and thaw individual token accounts.',
    disabled: !!enableSrfc37,
    disabledReason: enableSrfc37 ? FREEZE_AUTHORITY_SRFC37_REASON : undefined,
});

export function stablecoinAuthorityFields(options: StablecoinOptions): AuthorityField<StablecoinOptions>[] {
    return [
        { key: 'metadataAuthority', label: 'Metadata Update Authority' },
        { key: 'pausableAuthority', label: 'Pausable Authority' },
        { key: 'confidentialBalancesAuthority', label: 'Confidential Balances Authority' },
        { key: 'permanentDelegateAuthority', label: 'Permanent Delegate Authority' },
        freezeAuthorityField<StablecoinOptions>(options.enableSrfc37),
    ];
}

export function arcadeTokenAuthorityFields(options: ArcadeTokenOptions): AuthorityField<ArcadeTokenOptions>[] {
    return [
        { key: 'metadataAuthority', label: 'Metadata Update Authority' },
        { key: 'pausableAuthority', label: 'Pausable Authority' },
        { key: 'permanentDelegateAuthority', label: 'Permanent Delegate Authority' },
        freezeAuthorityField<ArcadeTokenOptions>(options.enableSrfc37),
    ];
}

export function tokenizedSecurityAuthorityFields(
    options: TokenizedSecurityOptions,
): AuthorityField<TokenizedSecurityOptions>[] {
    return [
        { key: 'metadataAuthority', label: 'Metadata Update Authority' },
        { key: 'pausableAuthority', label: 'Pausable Authority' },
        { key: 'confidentialBalancesAuthority', label: 'Confidential Balances Authority' },
        { key: 'permanentDelegateAuthority', label: 'Permanent Delegate Authority' },
        { key: 'permissionedBurnAuthority', label: 'Permissioned Burn Authority' },
        { key: 'scaledUiAmountAuthority', label: 'Scaled UI Amount Authority' },
        freezeAuthorityField<TokenizedSecurityOptions>(options.enableSrfc37),
    ];
}

/**
 * Custom tokens only show an authority for extensions the user actually selected, so the
 * list tracks the Extensions step.
 */
export function customTokenAuthorityFields(options: CustomTokenOptions): AuthorityField<CustomTokenOptions>[] {
    const fields: AuthorityField<CustomTokenOptions>[] = [];

    // Editable only without metadata — see rule 2 above.
    if (options.enableMetadata === false) {
        fields.push({
            key: 'mintAuthority',
            label: 'Mint Authority',
            help: 'Can mint new supply.',
        });
    } else {
        fields.push({ key: 'metadataAuthority', label: 'Metadata Update Authority' });
    }

    if (options.enablePausable) {
        fields.push({ key: 'pausableAuthority', label: 'Pausable Authority' });
    }
    if (options.enablePermanentDelegate) {
        fields.push({ key: 'permanentDelegateAuthority', label: 'Permanent Delegate Authority' });
    }
    if (options.enableConfidentialBalances) {
        fields.push({ key: 'confidentialBalancesAuthority', label: 'Confidential Balances Authority' });
    }
    if (options.enableScaledUiAmount) {
        fields.push({ key: 'scaledUiAmountAuthority', label: 'Scaled UI Amount Authority' });
    }
    if (options.enableTransferFee) {
        fields.push(
            { key: 'transferFeeAuthority', label: 'Transfer Fee Config Authority' },
            { key: 'withdrawWithheldAuthority', label: 'Withdraw Withheld Authority' },
        );
    }
    if (options.enableInterestBearing) {
        fields.push({ key: 'interestBearingAuthority', label: 'Interest Bearing Authority' });
    }
    if (options.enableTransferHook) {
        fields.push({ key: 'transferHookAuthority', label: 'Transfer Hook Authority' });
    }

    fields.push(freezeAuthorityField<CustomTokenOptions>(options.enableSrfc37));

    return fields;
}
