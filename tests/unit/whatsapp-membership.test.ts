import { describe, expect, it } from "vitest";
import {
  classifyParticipantStatus,
  desiredMembership,
  isRetryable,
  retryDelayMs,
} from "@/lib/whatsapp/membership";
import {
  processMembershipJob,
  type JobContext,
} from "@/whatsapp-worker/src/membership";
import { FakeWhatsAppAdapter } from "@/whatsapp-worker/src/fake-adapter";

describe("membership decision logic", () => {
  const base = { phoneVerified: true, consented: true, syncEnabled: true };

  it("on the beach and eligible -> member", () => {
    expect(desiredMembership({ ...base, onBeach: true })).toBe(true);
  });

  it("off the beach and eligible -> not member", () => {
    expect(desiredMembership({ ...base, onBeach: false })).toBe(false);
  });

  it("no consent, no verification, or sync disabled -> no action", () => {
    expect(
      desiredMembership({ ...base, consented: false, onBeach: true }),
    ).toBeNull();
    expect(
      desiredMembership({ ...base, phoneVerified: false, onBeach: true }),
    ).toBeNull();
    expect(
      desiredMembership({ ...base, syncEnabled: false, onBeach: true }),
    ).toBeNull();
  });
});

describe("retry classification", () => {
  it("classifies participant statuses", () => {
    expect(classifyParticipantStatus("200")).toBe("ok");
    expect(classifyParticipantStatus("409")).toBe("ok");
    expect(classifyParticipantStatus("403")).toBe("invite_required");
    expect(classifyParticipantStatus("401")).toBe("not_on_whatsapp");
    expect(classifyParticipantStatus("500")).toBe("temporary");
  });

  it("retries temporary but not permanent failures", () => {
    expect(isRetryable("temporary")).toBe(true);
    expect(isRetryable("invite_required")).toBe(false);
    expect(isRetryable("not_on_whatsapp")).toBe(false);
    expect(isRetryable("permanent")).toBe(false);
  });

  it("backoff is bounded with jitter", () => {
    for (let a = 1; a < 20; a++) {
      const d = retryDelayMs(a, () => 0.5);
      expect(d).toBeGreaterThan(1000);
      expect(d).toBeLessThanOrEqual(15 * 60_000 * 1.3);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Worker job processing against the fake adapter                      */
/* ------------------------------------------------------------------ */

interface Harness {
  ctx: JobContext;
  states: string[];
  finishes: Array<{ state: string; patch?: Record<string, unknown> }>;
  invites: string[];
}

function makeCtx(
  adapter: FakeWhatsAppAdapter,
  job: Partial<JobContext["job"]> & { desired_membership: boolean },
  current: Awaited<ReturnType<JobContext["load"]>>,
): Harness {
  const states: string[] = [];
  const finishes: Array<{ state: string; patch?: Record<string, unknown> }> =
    [];
  const invites: string[] = [];
  const ctx: JobContext = {
    job: {
      id: "job-1",
      user_id: "user-1",
      phone_e164: "+16175558331",
      attempts: 0,
      ...job,
    },
    groupJid: adapter.group.jid,
    load: async () => current,
    setState: async (s) => {
      states.push(s);
    },
    finish: async (state, patch) => {
      finishes.push({ state, patch });
    },
    storeInvite: async (url) => {
      invites.push(url);
    },
    log: () => {},
  };
  return { ctx, states, finishes, invites };
}

const eligibleOnBeach = {
  onBeach: true,
  phoneE164: "+16175558331",
  phoneVerified: true,
  consented: true,
  syncEnabled: true,
};

describe("membership job processing (fake adapter)", () => {
  it("join beach: adds the user and marks member", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const h = makeCtx(adapter, { desired_membership: true }, eligibleOnBeach);
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.members.has("16175558331@s.whatsapp.net")).toBe(true);
    expect(h.states).toEqual(["member"]);
    expect(h.finishes[0]?.state).toBe("done");
  });

  it("adding an existing member is success without another add call", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.members.add("16175558331@s.whatsapp.net");
    const h = makeCtx(adapter, { desired_membership: true }, eligibleOnBeach);
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.addCalls).toBe(0);
    expect(h.states).toEqual(["member"]);
    expect(h.finishes[0]?.state).toBe("done");
  });

  it("leave beach: removes the user and marks not_member", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.members.add("16175558331@s.whatsapp.net");
    const h = makeCtx(
      adapter,
      { desired_membership: false },
      { ...eligibleOnBeach, onBeach: false },
    );
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.members.size).toBe(0);
    expect(h.states).toEqual(["not_member"]);
    expect(h.finishes[0]?.state).toBe("done");
  });

  it("removing an absent member is success", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const h = makeCtx(
      adapter,
      { desired_membership: false },
      { ...eligibleOnBeach, onBeach: false },
    );
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.removeCalls).toBe(0);
    expect(h.states).toEqual(["not_member"]);
    expect(h.finishes[0]?.state).toBe("done");
  });

  it("rapid ON->OFF: a stale add job is superseded, not executed", async () => {
    const adapter = new FakeWhatsAppAdapter();
    const h = makeCtx(
      adapter,
      { desired_membership: true },
      { ...eligibleOnBeach, onBeach: false }, // user already left again
    );
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.addCalls).toBe(0);
    expect(h.finishes[0]?.state).toBe("superseded");
  });

  it("privacy-blocked add becomes an invite flow, no endless retries", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.privacyBlocked.add("+16175558331");
    const h = makeCtx(adapter, { desired_membership: true }, eligibleOnBeach);
    await processMembershipJob(adapter, h.ctx);
    expect(h.states).toEqual(["invite_required"]);
    expect(h.invites).toEqual(["https://chat.whatsapp.com/fake-invite"]);
    expect(h.finishes[0]?.state).toBe("done");
  });

  it("number not on WhatsApp fails permanently", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.notOnWhatsApp.add("+16175558331");
    const h = makeCtx(adapter, { desired_membership: true }, eligibleOnBeach);
    await processMembershipJob(adapter, h.ctx);
    expect(h.states).toEqual(["failed"]);
    expect(h.finishes[0]?.state).toBe("failed");
  });

  it("temporary failure reschedules with backoff", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.flaky.add("+16175558331");
    const h = makeCtx(adapter, { desired_membership: true }, eligibleOnBeach);
    await processMembershipJob(adapter, h.ctx);
    expect(h.finishes[0]?.state).toBe("queued");
    expect(h.finishes[0]?.patch?.attempts).toBe(1);
  });

  it("consent revoked mid-flight supersedes an add but still allows removal", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.members.add("16175558331@s.whatsapp.net");
    const revoked = { ...eligibleOnBeach, consented: false };
    const add = makeCtx(adapter, { desired_membership: true }, revoked);
    await processMembershipJob(adapter, add.ctx);
    expect(add.finishes[0]?.state).toBe("superseded");
    const remove = makeCtx(adapter, { desired_membership: false }, revoked);
    await processMembershipJob(adapter, remove.ctx);
    expect(adapter.members.size).toBe(0);
    expect(remove.finishes[0]?.state).toBe("done");
  });

  it("deleted profile: removal still executes from the job's phone", async () => {
    const adapter = new FakeWhatsAppAdapter();
    adapter.members.add("16175558331@s.whatsapp.net");
    const h = makeCtx(adapter, { desired_membership: false }, null);
    await processMembershipJob(adapter, h.ctx);
    expect(adapter.members.size).toBe(0);
    expect(h.finishes[0]?.state).toBe("done");
  });
});
