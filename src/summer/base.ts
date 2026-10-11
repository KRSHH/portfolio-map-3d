// Where the vendored world's files live (public/summer), whatever sub-path the map is served under.
export const SUMMER_BASE: string = new URL(import.meta.env.BASE_URL + "summer/", window.location.href).toString();
