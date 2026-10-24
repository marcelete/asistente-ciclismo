// Config plugin: declara los paquetes de OpenTracks en el <queries> del manifiesto, para que
// Android 11+ deje ver si está instalada y abrirla desde la app (botón "Abrir OpenTracks").
// Se aplica en `npx expo prebuild`, así `android/` sigue siendo generado.
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = ['de.dennisguse.opentracks', 'de.dennisguse.opentracks.playStore'];

module.exports = function withOpenTracksQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!Array.isArray(manifest.queries) || manifest.queries.length === 0) manifest.queries = [{}];
    const queries = manifest.queries[0];
    const pkgs = Array.isArray(queries.package) ? queries.package : [];
    for (const name of PACKAGES) {
      if (!pkgs.some((p) => p.$ && p.$['android:name'] === name)) pkgs.push({ $: { 'android:name': name } });
    }
    queries.package = pkgs;
    return cfg;
  });
};
