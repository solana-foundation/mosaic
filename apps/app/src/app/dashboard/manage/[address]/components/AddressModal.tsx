import { Button } from '@/components/ui/button';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: () => void;
    newAddress: string;
    onAddressChange: (address: string) => void;
    title: string;
    placeholder: string;
    buttonText: string;
}

export function AddressModal({
    isOpen,
    onClose,
    onAdd,
    newAddress,
    onAddressChange,
    title,
    placeholder,
    buttonText,
}: AddressModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-4">{title}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Solana Address</label>
                        <input
                            type="text"
                            value={newAddress}
                            onChange={e => onAddressChange(e.target.value)}
                            placeholder={placeholder}
                            className="w-full p-2 border rounded-md"
                        />
                    </div>
                    <div className="flex space-x-2">
                        <Button onClick={onAdd} disabled={!newAddress.trim()} className="flex-1">
                            {buttonText}
                        </Button>
                        <Button variant="outline" onClick={onClose} className="flex-1">
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
