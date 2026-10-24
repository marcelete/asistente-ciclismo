// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Estas librerías no están enlazadas en la app (ver react-native.config.js): importarlas cierra la app.
const NOT_LINKED = ['react-native-reanimated', 'react-native-gesture-handler', 'react-native-worklets'];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NOT_LINKED.map((name) => ({
            name,
            message: 'No está enlazada en esta app: usá Animated y PanResponder de react-native.',
          })),
        },
      ],
    },
  },
]);
