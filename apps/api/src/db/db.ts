// The handle every repo function takes: it leads to the DynamoDB Store (see backend-ddb.ts); there is no SQL behind it.
/**
 * A repo function is `(db, ...args)`; `db` only carries the Store the function runs on (`attachedOf(db)`), so repo
 * signatures stay the same whatever the Store is. `transaction` runs `fn` on the same handle: DynamoDB atomicity is
 * inside each body (store transactions and conditions), so grouping calls here adds none.
 */
export interface Db {
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
