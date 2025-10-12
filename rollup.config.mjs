import resolve from 'rollup-plugin-node-resolve';
import glslify from 'rollup-plugin-glslify';

export default {
  input: 'src/main.js',
  output: {
    file: 'public/assets/js/main.js'
  },
  plugins: [glslify(), resolve()]
};