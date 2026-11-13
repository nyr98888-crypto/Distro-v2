export type DeviceKind = 'pc' | 'android' | 'ios'

export function detectDevice(): DeviceKind {
  if (typeof navigator === 'undefined') return 'pc'
  const ua = navigator.userAgent || ''

  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  if (/Android/i.test(ua)) return 'android'
  return 'pc'
}
