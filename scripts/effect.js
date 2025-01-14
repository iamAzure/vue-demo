//import {} from './scheduler.js';

let activityEffect;
export const track = (target, key) => {
  if (!activityEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    depsMap = new Map();
    bucket.set(target, depsMap);
  }
  let deps = depsMap.get(key);
  if (!deps) {
    deps = new Set();
    depsMap.set(key, deps);
  }
  deps.add(activityEffect);
  activityEffect.deps.push(deps);
};

export const trigger = (target, key) => {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  const effectsRunner = new Set();
  effects &&
    effects.forEach((fn) => {
      // 防止自增操作时的无线递归调用自身
      // example： proxy.a = proxy.a + 1;
      if (fn !== activityEffect) {
        effectsRunner.add(fn);
      }
    });
  effectsRunner.forEach((fn) => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn);
    } else {
      fn();
    }
  });
};

const bucket = new WeakMap();
// effect 栈，用于支持 effect 嵌套
const effectStack = [];

export const effect = (fn, options = {}) => {
  /**  effect 会在 effect 调用和 trigger(set) 调用时执行 **/
  let effectFn = () => {
    cleanup(effectFn);
    activityEffect = effectFn;
    effectStack.push(effectFn);
    /** fn 的执行会触发 track 的执行 **/
    const res = fn();
    effectStack.pop();
    activityEffect = effectStack[effectStack.length - 1];
    return res;
  };
  // 调度器 (scheduler) 挂载到 effect
  effectFn.options = options;
  effectFn.deps = [];
  if (!effectFn.options.lazy) {
    effectFn();
  }
  return effectFn;
};

export const cleanup = (effectFn) => {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // 删除谁 ？ --> 删除当前副作用函数
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
};
