export function EnableSrfc37Toggle({
    enabled,
    setEnabled,
}: {
    enabled?: boolean | string;
    setEnabled: (value: 'true' | 'false') => void;
}) {
    const isChecked = (enabled as unknown) === true || enabled === 'true';
    return (
        <div className="mt-2 rounded-md border p-3">
            <label className="flex items-start gap-3">
                <input
                    type="checkbox"
                    className="mt-1"
                    checked={isChecked}
                    onChange={e => setEnabled(e.target.checked ? 'true' : 'false')}
                />
                <span>
                    <span className="font-medium">Enable advanced allowlist/blocklist (Token ACL)</span>
                    <span className="block text-xs text-muted-foreground">
                        Beta: under active development. Behavior may change; use on devnet or with caution.
                    </span>
                </span>
            </label>
        </div>
    );
}
