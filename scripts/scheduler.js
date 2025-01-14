let isFlushing = false;
const p = Promise.resolve();

export const jobQueue = new Set();
export function flushJob() {
  if (isFlushing) return;
  isFlushing = true;
  p.then(() => {
    jobQueue.forEach((job) => {
      job();
    });
  }).finally(() => {
    isFlushing = false;
  });
}
