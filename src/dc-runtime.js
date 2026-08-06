import React from 'react';

/**
 * Base class for the prototype's screen logic.
 *
 * Screens declare their view-model in `renderVals()`; `render()` merges that
 * with `this.props` into `V` and returns the markup. Everything else is a
 * plain React class component: state, setState, refs and lifecycle.
 */
export class DCLogic extends React.Component {
  renderVals() {
    return {};
  }
}

export default DCLogic;
