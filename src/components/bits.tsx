/* Small shared UI pieces: district icons/chips, logo thumbnails and person headshots. */
import {
  Anchor,
  Baby,
  Banknote,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Camera,
  Car,
  Cloud,
  Code,
  Coffee,
  Cpu,
  Dna,
  Droplets,
  Dumbbell,
  Factory,
  Film,
  FlaskConical,
  Gamepad2,
  Gem,
  Globe,
  GraduationCap,
  Hammer,
  HeartHandshake,
  HeartPulse,
  House,
  Landmark,
  Layers,
  Leaf,
  Lock,
  Megaphone,
  Microscope,
  Mountain,
  Music,
  Network,
  Orbit,
  Package,
  Palette,
  PawPrint,
  Plane,
  Radar,
  Rocket,
  Satellite,
  Scale,
  Server,
  Shield,
  Ship,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sprout,
  Stethoscope,
  Store,
  Sun,
  Tractor,
  Trophy,
  Truck,
  Users,
  Utensils,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { districtBySlug, initials, personInitials } from "../data/catalog";
import type { Company, DistrictSlug, LogoInfo, Person } from "../data/types";
import { companyLogo } from "../three/logoInfo";

/** The icons a district may name in site/taxonomy.json (`icon`), by lucide name. bits.test.ts fails on a district whose icon is not here. */
export const DISTRICT_ICONS: Record<string, LucideIcon> = {
  "anchor": Anchor,
  "baby": Baby,
  "banknote": Banknote,
  "book-open": BookOpen,
  "bot": Bot,
  "brain": Brain,
  "briefcase": Briefcase,
  "building-2": Building2,
  "camera": Camera,
  "car": Car,
  "cloud": Cloud,
  "code": Code,
  "coffee": Coffee,
  "cpu": Cpu,
  "dna": Dna,
  "droplets": Droplets,
  "dumbbell": Dumbbell,
  "factory": Factory,
  "film": Film,
  "flask-conical": FlaskConical,
  "gamepad-2": Gamepad2,
  "gem": Gem,
  "globe": Globe,
  "graduation-cap": GraduationCap,
  "hammer": Hammer,
  "heart-handshake": HeartHandshake,
  "heart-pulse": HeartPulse,
  "house": House,
  "landmark": Landmark,
  "layers": Layers,
  "leaf": Leaf,
  "lock": Lock,
  "megaphone": Megaphone,
  "microscope": Microscope,
  "mountain": Mountain,
  "music": Music,
  "network": Network,
  "orbit": Orbit,
  "package": Package,
  "palette": Palette,
  "paw-print": PawPrint,
  "plane": Plane,
  "radar": Radar,
  "rocket": Rocket,
  "satellite": Satellite,
  "scale": Scale,
  "server": Server,
  "shield": Shield,
  "ship": Ship,
  "shirt": Shirt,
  "shopping-bag": ShoppingBag,
  "sparkles": Sparkles,
  "sprout": Sprout,
  "stethoscope": Stethoscope,
  "store": Store,
  "sun": Sun,
  "tractor": Tractor,
  "trophy": Trophy,
  "truck": Truck,
  "users": Users,
  "utensils": Utensils,
  "wind": Wind,
  "wrench": Wrench,
  "zap": Zap,
};

export function DistrictIcon({ slug, size = 16 }: { slug: DistrictSlug; size?: number }) {
  const d = districtBySlug.get(slug);
  const Icon = (d && DISTRICT_ICONS[d.icon]) || Layers;
  return <Icon size={size} aria-hidden="true" strokeWidth={2.2} />;
}

export function DistrictChip({ slug, short = false, onClick }: { slug: DistrictSlug; short?: boolean; onClick?: () => void }) {
  const d = districtBySlug.get(slug)!;
  const body = (
    <>
      <span className="district-dot" style={{ background: d.color }} aria-hidden="true">
        <DistrictIcon slug={slug} size={11} />
      </span>
      {short ? d.short : d.label}
    </>
  );
  return onClick ? (
    <button type="button" className="chip chip-district" onClick={onClick} title={`Show ${d.label}`}>
      {body}
    </button>
  ) : (
    <span className="chip chip-district">{body}</span>
  );
}

/** A company's logo measurements once its image has loaded (null until then, or when it has none). */
function useLogoInfo(company: Company): LogoInfo | null {
  const [info, setInfo] = useState<LogoInfo | null>(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    companyLogo(company).then((l) => live && setInfo(l?.info ?? null));
    return () => {
      live = false;
    };
  }, [company]);
  return info;
}

/** The company's logo on its plate, or a monogram in the district color. */
export function LogoThumb({ company, size = 44 }: { company: Company; size?: number }) {
  const d = districtBySlug.get(company.district)!;
  const info = useLogoInfo(company);
  if (!company.logo) {
    return (
      <span className="logo-thumb logo-thumb-mono" style={{ width: size * 1.6, height: size, background: d.color }} aria-hidden="true">
        {initials(company.name)}
      </span>
    );
  }
  const bg = info?.plate === "dark" ? "var(--brand-ink)" : info?.plate === "self" ? info.bg ?? "#fff" : "#fff";
  // Opaque ("self") logos carry their own background, so they fill the frame edge to edge.
  const compact = !!info && info.plate !== "self" && info.w / info.h < 1.6;
  return (
    <span className={`logo-thumb ${compact ? "is-compact" : ""}`} style={{ width: size * 1.6, height: size, background: bg, borderColor: d.color }} aria-hidden="true">
      <img src={company.logo} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

/** A person's headshot in a circle ringed in the person color, or their initials when the page shows no photo (never a stock face). */
export function PersonThumb({ person, size = 44 }: { person: Person; size?: number }) {
  if (!person.headshot) {
    return (
      <span className="person-thumb person-thumb-initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
        {personInitials(person.name)}
      </span>
    );
  }
  return (
    <span className="person-thumb" style={{ width: size, height: size }} aria-hidden="true">
      <img src={person.headshot} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}
