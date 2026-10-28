import type { ImgHTMLAttributes } from 'react';

export const SMART_ESGP_MARK_SRC = '/smart-esgp-mark.png';

interface SmartEsgpMarkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
 alt?: string;
 decorative?: boolean;
}

export const SmartEsgpMark = ({
 alt = 'Smart-ESGP logo',
 className,
 decorative = true,
 ...props
}: SmartEsgpMarkProps) => (
 <img
 src={SMART_ESGP_MARK_SRC}
 alt={decorative ? '' : alt}
 aria-hidden={decorative ? true : undefined}
 className={className}
 decoding="async"
 draggable={false}
 {...props}
 />
);
