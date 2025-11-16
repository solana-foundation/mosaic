import { useInputValidation } from '@/hooks/useInputValidation';

interface SolanaAddressInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helpText?: string;
    disabled?: boolean;
    required?: boolean;
    showValidation?: boolean;
}

/**
 * Reusable Solana address input with validation
 */
export function SolanaAddressInput({
    label,
    value,
    onChange,
    placeholder = 'Enter Solana address...',
    helpText,
    disabled = false,
    required = false,
    showValidation = true,
}: SolanaAddressInputProps) {
    const { validateSolanaAddress } = useInputValidation();
    const isValid = !value || validateSolanaAddress(value);

    return (
        <div>
            <label className="block text-sm font-medium mb-2">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full p-2 border rounded-md"
                disabled={disabled}
            />
            {helpText && <p className="text-xs text-muted-foreground mt-1">{helpText}</p>}
            {showValidation && value && !isValid && (
                <p className="text-sm text-red-600 mt-1">Please enter a valid Solana address</p>
            )}
        </div>
    );
}
