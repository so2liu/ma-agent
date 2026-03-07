let executing = false;

export function isScheduledTaskExecuting(): boolean {
  return executing;
}

export function setScheduledTaskExecuting(value: boolean): void {
  executing = value;
}
