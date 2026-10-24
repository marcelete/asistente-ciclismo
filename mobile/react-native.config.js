// Expo Router trae Gesture Handler, Reanimated y Worklets como dependencias de su menú lateral,
// que la app no usa: no están en el bundle de JS (se verificó con el mapa de fuentes de
// `npx expo export`). No se enlazan al APK, que queda más chico, y así la compilación en Windows no
// choca con el límite de 260 caracteres de ninja (el código generado de Gesture Handler lo pasa).
// Si algún día se usa el Drawer de Expo Router o Reanimated, hay que sacar estas líneas.
module.exports = {
  dependencies: {
    'react-native-gesture-handler': { platforms: { android: null, ios: null } },
    'react-native-reanimated': { platforms: { android: null, ios: null } },
    'react-native-worklets': { platforms: { android: null, ios: null } },
  },
};
