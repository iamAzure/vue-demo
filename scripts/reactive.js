
import { track, trigger } from "./effect.js";
import { ITERATE_KEY, MAP_KEY_ITERATE_KEY } from "./keys.js";
import { TriggerType, ReactiveFlags } from './types.js';


const reactiveMap = new Map();

const arrayInstrumentations = {};

function createIterationMethod(type) {
    return function () {
        const target = this[ReactiveFlags.RAW];
        let itr;
        if (type === 'entries') {
            itr = target[Symbol.iterator]();
        } else if (type === 'values') {
            itr = target.values();
        } else if (type === 'keys') {
            itr = target.keys();
        }
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
        track(target, type === 'keys' ? MAP_KEY_ITERATE_KEY : ITERATE_KEY)
        return {
            next() {
                const { value, done } = itr.next();
                if (type === 'entries') {
                    return {
                        value: value ? [wrap(value[0]), wrap(value[1])] : value,
                        done
                    };
                } else {
                    return {
                        value: wrap(value),
                        done
                    };
                }
            },
            [Symbol.iterator]() {
                return this;
            }
        };
    };
}

const mutableInstrumentations = {
    [Symbol.iterator]: createIterationMethod('entries'),
    entries: createIterationMethod('entries'),
    values: createIterationMethod('values'),
    keys: createIterationMethod('keys'),
    get(key) {
        const target = this[ReactiveFlags.RAW];
        const hadKey = target.has(key);
        track(target, key)
        if (hadKey) {
            const res = target.get(key);
            return typeof res === 'object' ? reactive(res) : res
        }
    },
    set(key, value) {
        const target = this[ReactiveFlags.RAW];
        const hadKey = target.has(key);
        const oldVal = target.get(key);
        const rawValue = value.raw || value;
        const res = target.set(key, rawValue);
        if (!hadKey) {
            trigger(target, key, TriggerType.ADD);
        } else if (oldVal !== value || (oldVal === oldVal && value === value)) {
            trigger(target, key, TriggerType.SET)
        }
        return res;
    },
    add(key) {
        const target = this[ReactiveFlags.RAW];
        const hadKey = target.has(key);
        const res = target.add(key);
        if (!hadKey) {
            trigger(target, key, TriggerType.ADD);
        }
        return res;
    },
    delete(key) {
        const target = this[ReactiveFlags.RAW];
        const hadKey = target.has(key);
        const res = target.delete(key);
        if (hadKey) {
            trigger(target, key, TriggerType.DELETE)
        }
        return res;
    },
    forEach(callback, thisArg) {
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
        const target = this[ReactiveFlags.RAW];
        track(target, ITERATE_KEY)
        target.forEach((v, k) => {
            callback.call(thisArg, wrap(v), wrap(k), this)
        })
    }
};


['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
    const originMethod = Array.prototype[method];
    arrayInstrumentations[method] = function (...args) {
        // this 是代理对象，现在代理对象中查找，将结果存储在 res 中
        let res = originMethod.apply(this, args);
        if (res === false || res === -1) {
            // res 为 false 说明没找到，通过 this[ROW_KEY] 拿到原始数据，再去其中查找并更新 res 值
            res = originMethod.apply(this[ReactiveFlags.RAW], args);
        }
        return res;
    }
});

export let shouldTrack = true;

['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
    const originMethod = Array.prototype[method];
    arrayInstrumentations[method] = function (...args) {
        shouldTrack = false;
        let res = originMethod.apply(this, args);
        shouldTrack = true;
        return res;
    }
})

const createReactive = (obj, isShallow = false, isReadonly = false) => {
    return new Proxy(obj, {
        get(target, key, receiver) {
            const isMap = target instanceof Map;
            const isSet = target instanceof Set;
            console.log('createReactive get target is===>', target, isMap);
            if (key === ReactiveFlags.RAW) {
                return target;
            }
            if (isSet || isMap) {
                if (key === 'size') {
                    track(target, ITERATE_KEY);
                    return Reflect.get(target, key, target);
                }
                return mutableInstrumentations[key];
            }
            if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
                return Reflect.get(arrayInstrumentations, key, receiver);
            }
            if (!isReadonly && typeof key != 'symbol') {
                track(target, key);
            }
            const res = Reflect.get(target, key, receiver);
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
                // 处理数组的情况, 比如 push、pop、unshift、shift 等方法
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
            const res = Reflect.set(target, key, newVal, receiver);
            const isNotNaN = (oldVal === oldVal || newVal === newVal);
            if (target === receiver[ReactiveFlags.RAW]) {
                if (oldVal !== newVal && isNotNaN) {
                    trigger(target, key, type, newVal);
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
            // 对于数组来说会影响 for...in 循环的其实就是 length 的长度发生改变
            // 比如 arr.length = 0, push unshift pop 
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
            return Reflect.ownKeys(target);
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

export const reactive = (obj) => {
    const existProxy = reactiveMap.get(obj);
    if (existProxy) return existProxy;
    const proxy = createReactive(obj);
    reactiveMap.set(obj, proxy);
    return proxy;
};

export const readonly = (obj) => createReactive(obj, false, true);

export const shallowReactive = (obj) => createReactive(obj, true);
