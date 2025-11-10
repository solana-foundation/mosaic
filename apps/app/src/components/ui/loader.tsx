import * as React from 'react';
import { cn } from '@/lib/utils';
import styles from './loader.module.css';

export interface LoaderProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: string | number;
}

const Loader = React.forwardRef<HTMLSpanElement, LoaderProps>(
  ({ className, size = '2em', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(styles.loader, className)}
      style={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        color: 'currentColor',
        ...props.style,
      }}
      aria-label="Loading"
      {...props}
    />
  )
);
Loader.displayName = 'Loader';

export { Loader };
