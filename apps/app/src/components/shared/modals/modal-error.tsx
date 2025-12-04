interface ModalErrorProps {
    error?: string;
}

export function ModalError({ error }: ModalErrorProps) {
    if (!error) return null;

    return (
        <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-200 dark:border-red-800">
            {error}
        </div>
    );
}
