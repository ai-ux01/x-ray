// Viewport profiles for multi-viewport rendering (Phase 5).
//
// The renderer resizes a single loaded page across these profiles, measuring
// and screenshotting at each. Profiles are ordered widest-last is NOT assumed;
// callers should not rely on order. Mobile profiles enable touch/isMobile hints
// and a higher device scale factor to mirror real devices.

export type ViewportKey = "mobile-sm" | "mobile" | "tablet" | "desktop";

export interface ViewportProfile {
  key: ViewportKey;
  label: string;
  width: number;
  height: number;
  /** Touch + mobile UA hints (isMobile true for phones). */
  isMobile: boolean;
  deviceScaleFactor: number;
}

export const VIEWPORT_PROFILES: ViewportProfile[] = [
  {
    key: "mobile-sm",
    label: "Mobile (375px)",
    width: 375,
    height: 812,
    isMobile: true,
    deviceScaleFactor: 3,
  },
  {
    key: "mobile",
    label: "Mobile (390px)",
    width: 390,
    height: 844,
    isMobile: true,
    deviceScaleFactor: 3,
  },
  {
    key: "tablet",
    label: "Tablet (768px)",
    width: 768,
    height: 1024,
    isMobile: false,
    deviceScaleFactor: 2,
  },
  {
    key: "desktop",
    label: "Desktop (1440px)",
    width: 1440,
    height: 900,
    isMobile: false,
    deviceScaleFactor: 1,
  },
];

/** Profiles considered "mobile" for the Mobile analyzer's primary assessment. */
export const MOBILE_VIEWPORT_KEYS: ViewportKey[] = ["mobile-sm", "mobile"];
