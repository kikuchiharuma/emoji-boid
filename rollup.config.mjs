import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'src/main.js',
  output: {
    file: 'public/assets/js/main.js'
  },
  plugins: [resolve()]
};