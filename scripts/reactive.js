
import { track, trigger } from "./effect.js";
import { ITERATE_KEY } from "./keys.js";
import { TriggerType } from './types.js';


const createReactive = (obj, isShallow = false, isReadonly = false) => {
    return new Proxy(obj, {
        get(target, key, receiver) {
            if (key === 'raw') {
                return target;
            }
            const res = Reflect.get(target, key, receiver);
            track(target, key);
            if (isShallow) {
                return res;
            }
            if (typeof res === 'object' && res !== null) {
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;
        },
        set(target, key, newVal, receiver) {
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`);
                return true;
            }
            const oldVal = target[key];

            const getOpType = (target, key) => {
                // 处理数组的情况
                if (Array.isArray(target)) {
                    return Number(key) < target.length
                        ? TriggerType.SET
                        : TriggerType.ADD;
                }
                // 处理普通对象的情况
                return Object.prototype.hasOwnProperty.call(target, key)
                    ? TriggerType.SET
                    : TriggerType.ADD;
            }

            const type = getOpType(target, key);
            console.log('type is', type);
            const res = Reflect.set(target, key, newVal, receiver);
            const isNotNaN = (oldVal === oldVal || newVal === newVal);
            if (target === receiver.raw) {
                if (oldVal !== newVal && isNotNaN) {
                    trigger(target, key, type);
                };
            }
            return res;
        },
        has(target, key) {
            // 拦截 in 操作符
            track(target, key);
            return Reflect.has(target, key);
        },
        ownKeys(target) {
            // 拦截 for...in 循环，读取操作
            track(target, ITERATE_KEY);
            return Reflect.ownKeys(target, ITERATE_KEY);
        },
        deleteProperty(target, key) {
            // 检查被操作的属性是否是对象自己的属性
            const hadKey = Object.prototype.hasOwnProperty.call(target, key);
            const res = Reflect.deleteProperty(target, key);
            if (res && hadKey) {
                // 只有当被删除的属性是对象自己的属性并且成功删除时，才触发更新
                trigger(target, key, TriggerType.DELETE);
            }
            return res;
        }
    });
}

export const reactive = (obj) => createReactive(obj);

export const readonly = (obj) => createReactive(obj, false, true);

export const shallowReactive = (obj) => createReactive(obj, true);
