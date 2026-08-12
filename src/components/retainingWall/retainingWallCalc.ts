export type SoilType = "firmClay" | "looseSandy" | "fill"

export const SOIL_LABELS: Record<SoilType, string> = {
  firmClay: "Firm clay",
  looseSandy: "Loose or sandy soil",
  fill: "Made-up or fill ground",
}

/** Above this retained height, a DIY spec isn't offered at all — see
 * postProfile.ts's needsEngineer flagging. Matches the common NZ Building
 * Consent exemption threshold for an un-surcharged retaining wall.
 *
 * Deliberately fixed, not part of CalcSettings: this is a safety/legal
 * threshold, not a calculation preference — letting a saved/custom
 * settings profile move it would mean someone could quietly configure
 * their way past the warning instead of it protecting them. */
export const ENGINEER_HEIGHT_LIMIT_M = 1.5
