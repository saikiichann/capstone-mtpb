const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const config = {
  resolver: {
    extraNodeModules: {
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      process: require.resolve('process/browser'),
      zlib: require.resolve('browserify-zlib'),
      util: require.resolve('util'),
    },
    resolveRequest: (context, moduleName, platform) => {
      // I-redirect ang @supabase/realtime-js sa empty stub
      if (moduleName === '@supabase/realtime-js') {
        return {
          filePath: path.resolve(__dirname, 'src/supabase-realtime-stub.js'),
          type: 'sourceFile',
        };
      }
      // Default resolution
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);