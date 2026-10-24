// Config plugin: CMake acorta con un hash los nombres de los archivos objeto que pasarían de
// CMAKE_OBJECT_PATH_MAX caracteres. Sin esto, el código C++ generado de react-native-screens y
// react-native-safe-area-context arma rutas de más de 300 caracteres y el ninja de Windows (que
// no acepta más de 260) corta la compilación. Se aplica en `npx expo prebuild`, así `android/`
// sigue siendo generado.
//
// Por qué 250: CMake reemplaza el principio del nombre por un hash de 32 caracteres, pero conserva
// el nombre del archivo; con las carpetas de objetos de ~158 caracteres, un tope más bajo no deja
// lugar para los nombres largos (RNSScreenStackHeaderSubviewShadowNode.cpp.o) y CMake no acorta
// nada. Con 250 entran todos y la ruta, con el ".d" de dependencias, queda debajo de 260.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// asistente-ciclismo: rutas de objetos cortas';

module.exports = function withShortObjectPaths(config, { max = 250 } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) {
      cfg.modResults.contents += `
${MARK} (ver mobile/plugins/withShortObjectPaths.js)
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=${max}"
            }
        }
    }
}
`;
    }
    return cfg;
  });
};
