import { districtBySlug, industryLabel, serviceLabel } from "./catalog";
import type { Labels } from "./graph";

export const LABELS: Labels = {
  industry: (s) => industryLabel.get(s) ?? s,
  service: (s) => serviceLabel.get(s) ?? s,
  districts: districtBySlug,
};
