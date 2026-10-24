import { expect } from "vitest";

interface UserIsolationContract<TValue> {
  userA: string;
  userB: string;
  createForA: () => Promise<string>;
  list: (userId: string) => Promise<string[]>;
  update: (userId: string, id: string) => Promise<number>;
  remove: (userId: string, id: string) => Promise<number>;
  readOwnerValue: (id: string) => Promise<TValue | null>;
  expectedOwnerValue: TValue;
}

export async function assertUserIsolation<TValue>(contract: UserIsolationContract<TValue>) {
  const id = await contract.createForA();

  expect(await contract.list(contract.userA)).toContain(id);
  expect(await contract.list(contract.userB)).not.toContain(id);
  expect(await contract.update(contract.userB, id)).toBe(0);
  expect(await contract.readOwnerValue(id)).toEqual(contract.expectedOwnerValue);
  expect(await contract.remove(contract.userB, id)).toBe(0);
  expect(await contract.list(contract.userA)).toContain(id);
}
