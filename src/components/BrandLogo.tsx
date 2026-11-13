import clsx from 'clsx'

interface BrandLogoProps {
  size?: number
  className?: string
  rounded?: string
}

/** Official Distro brand mark (`public/logo.png`). */
export function BrandLogo({ size = 36, className, rounded = 'rounded-xl' }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Distro"
      width={size}
      height={size}
      className={clsx(rounded, 'object-contain bg-black', className)}
      draggable={false}
    />
  )
}
