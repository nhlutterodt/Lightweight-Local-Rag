export default {
  transform: {},
  testEnvironment: "node",
  moduleNameMapper: {
    "^@lancedb/lancedb$": "<rootDir>/tests/__mocks__/lancedb.js",
  },
};
