'use strict';

// CI only (deployment/forum/test/skins-readonly.sh), loaded with NODE_OPTIONS=--require.
// GitHub's runners for this repository have 2 CPUs, production has 4. NodeBB's Harmony theme
// rebuilds every skin at startup only on more than 2 CPUs, so report at least 4 to take the
// production code path.
const os = require('os');

const realCpus = os.cpus.bind(os);
os.cpus = () => {
  const cpus = realCpus();
  while (cpus.length < 4) cpus.push({ ...cpus[0] });
  return cpus;
};
