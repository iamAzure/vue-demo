import { ITERATE_KEY } from './keys.js';
import { TriggerType } from './types.js';

const bucket = new WeakMap();
// effect 栈，用于支持 effect 嵌套
const effectStack = [];

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
    // 每个 key 的依赖集合
    deps = new Set();
    depsMap.set(key, deps);
  }
  deps.add(activityEffect);
  activityEffect.deps.push(deps);
};

export const trigger = (target, key, type, newVal) => {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  const effectsRunner = new Set();
  effects &&
    effects.forEach((effectFn) => {
      // 防止自增操作时的无限递归调用自身
      // example： proxy.a = proxy.a + 1;
      // 这个语句既会触发 get-track 又会触发 set-trigger
      // 首先读取 obj.foo 的值，这会触发 track 操作，将当前副作用函数收集到“桶”中，接着将其加 1 后再赋值给 obj.foo，此时会触发 trigger 操作，即把“桶”中的副作用函数取出并执行。
      // 但问题是该副作用函数正在执行中，还没有执行完毕，就要开始下一次的执行。
      // 这样会导致无限递归地调用自己，于是就产生了栈溢出。
      if (effectFn !== activityEffect) {
        effectsRunner.add(effectFn);
      }
    });



  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    const iterateEffects = depsMap.get(ITERATE_KEY);
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activityEffect) {
        effectsRunner.add(effectFn);
      }
    })
  }

  // if (type === TriggerType.ADD && Array.isArray(target)) {
  //   const lengthEffects = depsMap.get('length');
  //   console.log('lengthEffects is', lengthEffects)
  //   lengthEffects && lengthEffects.forEach(effectFn => {
  //     if (effectFn !== activityEffect) {
  //       effectsRunner.add(effectFn)
  //     }
  //   })
  // }

  // // 如果操作目标是数组，并且修改了数组的 length 属性
  // if (Array.isArray(target) && key === 'length') {
  //   // 对于索引大于或等于新的 length 值的元素
  //   // 需要把所有相关的副作用函数去除并添加到
  //   depsMap.forEach((effectFn, key) => {
  //     if (key >= newVal) {
  //       effects.forEach(effectFn => {
  //         if (effectFn !== activityEffect) {
  //           effectsRunner.add(effectFn)
  //         }
  //       })
  //     }
  //   })
  // }

  effectsRunner.forEach((effectFn) => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
};

export const effect = (fn, options = {}) => {
  /**  effect 会在 effect 调用（register）和 trigger 调用时执行 **/
  let effectFn = () => {
    cleanup(effectFn);
    activityEffect = effectFn;
    effectStack.push(effectFn);
    const res = fn();
    effectStack.pop();
    activityEffect = effectStack[effectStack.length - 1];
    return res;
  };
  // 调度器 (scheduler) 挂载到 effect
  effectFn.options = options;
  // 用来存储所有包含当前副作用函数的依赖集合
  effectFn.deps = [];
  if (!effectFn.options.lazy) {
    effectFn();
  }
  return effectFn;
};

export const cleanup = (effectFn) => {
  for (let i = 0; i < effectFn.deps.length; i++) {
    // 从所有的依赖集合中，删除当前副作用函数
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
};
