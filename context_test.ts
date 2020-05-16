import {
  assertEquals,
  assertThrowsAsync,
} from "https://deno.land/std/testing/asserts.ts";
import { delay } from "https://deno.land/std@0.50.0/async/delay.ts";
import * as context from "./context.ts";

const { test } = Deno;

test("background context", () => {
  const ctx = new context.Background();
  assertEquals(ctx.error(), null);
  assertEquals(ctx.done(), null);
});

test("cancel context", async () => {
  const ctx = new context.Background();
  const cctx = new context.WithCancel(ctx);
  const cctx2 = new context.WithCancel(cctx);
  const cctx3 = new context.WithCancel(cctx2);
  const cctx4 = new context.WithCancel(cctx3);

  [cctx, cctx2, cctx3, cctx4].forEach((c, i) => {
    assertEquals(c.error(), null, "context: " + i);
    assertEquals(c.done().aborted, false, "context: " + i);
  });

  // cancel and will check the result of propagation
  cctx.cancel();
  await delay(10); // let cancellation propagate

  [cctx, cctx2, cctx3, cctx4].forEach((c, i) => {
    assertEquals(c.done().aborted, true, "cancel context: " + i);
    assertEquals(c.error(), new context.Canceled(), "cancel context: " + i);
  });
});

test("timeout context", async () => {
  const ctx = new context.Background();
  const tctx = new context.WithTimeout(ctx, 20); // 20ms
  const cctx = new context.WithCancel(tctx);
  const cctx2 = new context.WithCancel(cctx);
  const cctx3 = new context.WithCancel(cctx2);

  // wait 21ms
  // context canceling to children by context.WithTimeout(ctx, 20)
  await delay(21);

  assertEquals(tctx.error(), new context.DeadlineExceeded());
  assertEquals(tctx.done().aborted, true);

  [cctx, cctx2, cctx3].forEach((c, i) => {
    assertEquals(c.done().aborted, true, "timeout context: " + i);
    assertEquals(
      c.error(),
      new context.DeadlineExceeded(),
      "timeout context: " + i,
    );
  });
});

test("clearTimeout on context.WithTimeout", async () => {
  const ctx = new context.Background();

  const timeout = 50;
  const tctx = new context.WithTimeout(ctx, timeout); // 50ms

  // We expect to do clearTimeout on this cancel.
  tctx.cancel();
  assertEquals(tctx.error(), new context.Canceled());

  await delay(timeout + 10);

  // Unexpected new context.DeadlineExceeded()
  assertEquals(tctx.error(), new context.Canceled());
});

function ctxDelay(
  ctx: context.Context,
  ms: number,
): context.ContextPromise<void> {
  return new context.ContextPromise(ctx, (resolve, reject, signal) => {
    const id = setTimeout((): void => {
      clearTimeout(id);
      resolve();
    }, ms);
    signal.onSignaled((reason?: any) => {
      clearTimeout(id);
      reject(reason);
    });
  });
}

test("context promise", async () => {
  const ctx = new context.Background();

  await ctxDelay(ctx, 300); // expect to wait 300ms

  const cctx = new context.WithTimeout(ctx, 100);

  cctx.cancel();

  await assertThrowsAsync(async () => {
    await ctxDelay(cctx, 3000);
  }, context.Canceled);

  const tctx = new context.WithTimeout(ctx, 100);

  await assertThrowsAsync(async () => {
    await ctxDelay(tctx, 3000);
  }, context.DeadlineExceeded);
});
