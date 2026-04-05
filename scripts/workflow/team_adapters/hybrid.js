const worktree = require('./worktree');
const subagent = require('./subagent');

function filterState(state, predicate) {
  return {
    ...state,
    tasks: state.tasks.filter(predicate),
  };
}

function splitTasks(state) {
  return {
    writeHeavy: filterState(state, (task) => Array.isArray(task.writeScope) && task.writeScope.length > 0),
    readHeavy: filterState(state, (task) => !Array.isArray(task.writeScope) || task.writeScope.length === 0),
  };
}

function prepare(state, runtimeState) {
  const prepared = worktree.prepare(state, runtimeState);
  return subagent.prepare(state, prepared);
}

function dispatch(state, runtimeState) {
  const buckets = splitTasks(state);
  const afterWorktree = worktree.dispatch(buckets.writeHeavy, runtimeState);
  return subagent.dispatch(buckets.readHeavy, afterWorktree);
}

function poll(state, runtimeState) {
  const afterWorktree = worktree.poll(state, runtimeState);
  return subagent.poll(state, afterWorktree);
}

function collect(state, runtimeState) {
  const afterWorktree = worktree.collect(state, runtimeState);
  return subagent.collect(state, afterWorktree);
}

function stop(state, runtimeState) {
  const afterWorktree = worktree.stop(state, runtimeState);
  return subagent.stop(state, afterWorktree);
}

module.exports = {
  collect,
  dispatch,
  poll,
  prepare,
  stop,
};
