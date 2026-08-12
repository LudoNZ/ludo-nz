export const formatM = (m: number, decimals = 2): string => `${m.toFixed(decimals)} m`

export const formatMm = (m: number): string => `${Math.round(m * 1000)} mm`

export const formatM3 = (m3: number, decimals = 2): string => `${m3.toFixed(decimals)} m³`
