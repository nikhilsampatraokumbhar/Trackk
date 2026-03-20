// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude test files and mocks from production bundle
config.resolver.blockList = [
  /src\/__tests__\/.*/,
  /.*\.test\.[jt]sx?$/,
];

module.exports = config;
