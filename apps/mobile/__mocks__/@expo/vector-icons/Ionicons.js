/**
 * Jest stand-in for the Ionicons font icon (`src/ui/Icon.tsx`). The real one loads its
 * font asynchronously and re-renders when it arrives; under jest that could land after a
 * test file had finished — "import a file after the Jest environment has been torn down"
 * (2026-09-27). A plain element with the same props; tests still read `name` and `size`.
 */
const { createElement } = require('react');

function Ionicons(props) {
  return createElement('Ionicons', props);
}

module.exports = { __esModule: true, default: Ionicons };
