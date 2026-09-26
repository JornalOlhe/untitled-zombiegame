// Public client configuration. Only values that are safe to ship inside a public app live here:
// the project URL and the *publishable* key. Row Level Security + server functions guard the data.
// NEVER put a service_role key, OAuth client secret or any admin credential in this file.
window.DR_CONFIG = Object.freeze({
  supabaseUrl: "https://bfrewibnwclziuugypck.supabase.co",
  supabaseKey: "sb_publishable_VvgaKvzhO_FaF98h5QuiJw_Hyt8cXbj",
  // Deep link registered by the Android app (intent-filter) and the Windows app (protocol handler).
  authCallback: "untitledzombie://auth/callback",
  // Multiplayer network rates (messages per second). Lower = less traffic, more interpolation.
  net: { stateHz: 10, snapshotHz: 8, crowdedStateHz: 7, crowdedSnapshotHz: 6 },
});
