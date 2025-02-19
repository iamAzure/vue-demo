import { effect, track, trigger } from "./effect.js";

export const computed = (getter) => {
  let value;
  let dirty = true;
  const effectFn = effect(getter, {
    lazy: true,
    // 添加调度器，在调度器中将 dirty 重置为 true
    scheduler() {
      dirty = true;
      trigger(obj, "value");
    },
  });
  const obj = {
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      track(obj, "value");
      return value;
    },
  };
  return obj;
};
// 访问 obj.value 时，会触发 track，effect 函数执行