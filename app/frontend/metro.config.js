const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve("buffer"),
};

// Ignore deep C++ vendor and build files from Metro's file watcher
config.resolver.blockList = [
  /node_modules\/llama\.rn\/vendor\/.*/,
  /node_modules\/llama\.rn\/android\/\.cxx\/.*/,
  /.*\/android\/app\/build\/.*/,
];

module.exports = config;

