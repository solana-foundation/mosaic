'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconHexagonFill } from 'symbols-react';

interface TokenImagePreviewProps {
    uri: string;
    symbol?: string;
    className?: string;
}

export function TokenImagePreview({ uri, symbol, className }: TokenImagePreviewProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!uri) {
            setImageUrl(null);
            setError(false);
            return;
        }

        const fetchImage = async () => {
            setIsLoading(true);
            setError(false);

            try {
                // Check if it's a direct image URL
                if (uri.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                    setImageUrl(uri);
                    setIsLoading(false);
                    return;
                }

                // Try to fetch as JSON metadata
                const response = await fetch(uri);
                if (!response.ok) throw new Error('Failed to fetch');

                const contentType = response.headers.get('content-type');

                if (contentType?.includes('image')) {
                    // It's an image
                    setImageUrl(uri);
                } else if (contentType?.includes('json')) {
                    // It's JSON metadata, look for image field
                    const metadata = await response.json();
                    const image = metadata.image || metadata.icon || metadata.logo;
                    if (image) {
                        setImageUrl(image);
                    } else {
                        setError(true);
                    }
                } else {
                    // Try parsing as JSON anyway
                    const text = await response.text();
                    try {
                        const metadata = JSON.parse(text);
                        const image = metadata.image || metadata.icon || metadata.logo;
                        if (image) {
                            setImageUrl(image);
                        } else {
                            setError(true);
                        }
                    } catch {
                        // Maybe it's an image without proper extension
                        setImageUrl(uri);
                    }
                }
            } catch {
                setError(true);
            } finally {
                setIsLoading(false);
            }
        };

        const debounceTimer = setTimeout(fetchImage, 500);
        return () => clearTimeout(debounceTimer);
    }, [uri]);

    return (
        <div
            className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-primary/10',
                className,
            )}
        >
            {isLoading ? (
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : imageUrl && !error ? (
                <img
                    src={imageUrl}
                    alt={symbol || 'Token'}
                    className="w-full h-full object-cover"
                    onError={() => setError(true)}
                />
            ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <IconHexagonFill className="w-8 h-8 fill-primary/50" />
                </div>
            )}
        </div>
    );
}
