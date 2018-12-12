export interface AccountInfo {
  relation: 'parent' | 'peer' | 'child',
  assetCode: string,
  assetScale: number,
}

/**
 * An asset/currency including the code used to identify it (e.g. ISO4017 currency code) and scale
 */
export interface AssetInfo {
  scale: number
  code: string
}
