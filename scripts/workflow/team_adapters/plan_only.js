function prepare(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'prepared',
    notes: ['Plan-only adapter does not create child workspaces. Use task packets and manual collection.'],
  };
}

function dispatch(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'dispatched',
    notes: [
      ...(runtimeState.notes || []),
      'Plan-only adapter marked runtime as dispatched without external execution.',
    ],
  };
}

function poll(state, runtimeState) {
  return {
    ...runtimeState,
    status: runtimeState.status || 'prepared',
    summary: {
      activeWave: state.activeWave,
      dispatchedTasks: runtimeState.dispatchedTasks || [],
      workspaces: runtimeState.workspaces || {},
    },
  };
}

function collect(state, runtimeState) {
  return {
    ...runtimeState,
    collectedTasks: runtimeState.collectedTasks || [],
    notes: [
      ...(runtimeState.notes || []),
      'Plan-only adapter has no external artifacts to collect automatically.',
    ],
  };
}

function stop(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'paused',
  };
}

module.exports = {
  collect,
  dispatch,
  poll,
  prepare,
  stop,
};
