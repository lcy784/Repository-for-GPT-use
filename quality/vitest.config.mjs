export default {
  test: {
    include: ['tools/tiangong/tests/*.test.mjs'],
    allowOnly: false,
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 10000,
  },
};
