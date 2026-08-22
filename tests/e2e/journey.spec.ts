import { expect, test, type Page } from "@playwright/test";

// Full demo-mode user journey. Each test uses a unique email so demo
// profiles do not collide between tests or runs.

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Project-scoped so parallel desktop/mobile workers never collide. */
function scope(): string {
  return `${RUN}-${test.info().project.name}`;
}

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${scope()}@example.com`;
}

/** Unique per run so re-runs against a long-lived demo store never collide. */
function uniqueName(base: string): string {
  return `${base} ${RUN.slice(-4)}${test.info().project.name[0]}`;
}

/** Valid, run-unique, deterministic US number (area 617, exchange 2xx). */
function uniquePhone(offset: number): string {
  const projectShift = test.info().project.name === "mobile" ? 434_343 : 0;
  // Parse only 8 chars: full RUN exceeds double precision and offsets vanish.
  const n =
    (parseInt(RUN.slice(0, 8), 36) + offset * 101 + projectShift) % 1_000_000;
  return `2${String(n).padStart(6, "0")}`;
}

async function signInAndCreate(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /enter the beach/i }).click();
  await page.waitForURL("**/create-character");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: /save character/i }).click();
  await page.waitForURL("**/status");
}

test.describe("journey", () => {
  test("landing shows the island preview and no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /enter the beach/i }),
    ).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.body.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test("new user creates a character, joins, and appears on the beach", async ({
    page,
  }) => {
    await signInAndCreate(
      page,
      uniqueEmail("join"),
      uniqueName("Testy McTest"),
    );
    await page.getByRole("button", { name: /i'm on the beach/i }).click();
    await page.waitForURL("**/beach");
    await expect(
      page.getByRole("button", { name: /who's here/i }),
    ).toBeVisible();
    await expect(page.getByRole("application")).toBeVisible();
    // Own name appears in the directory with the YOU badge.
    await page.getByRole("button", { name: /who's here/i }).click();
    const drawer = page.getByRole("dialog", { name: /who's here/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(uniqueName("Testy McTest"))).toBeVisible();
    await expect(drawer.getByText("YOU")).toBeVisible();
  });

  test("leave and rejoin the beach from the top bar", async ({ page }) => {
    await signInAndCreate(page, uniqueEmail("leave"), uniqueName("Leaver"));
    await page.getByRole("button", { name: /i'm on the beach/i }).click();
    await page.waitForURL("**/beach");
    await page.getByRole("button", { name: /^leave$/i }).click();
    await expect(page.getByRole("button", { name: /^join$/i })).toBeVisible();
    await page.getByRole("button", { name: /who's here/i }).click();
    const drawer = page.getByRole("dialog", { name: /who's here/i });
    await expect(drawer.getByText(uniqueName("Leaver"))).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(page.getByRole("button", { name: /^leave$/i })).toBeVisible();
  });

  test("returning user skips onboarding", async ({ page }) => {
    const email = uniqueEmail("return");
    await signInAndCreate(page, email, uniqueName("Returner"));
    await page.getByRole("button", { name: /not today/i }).click();
    await page.waitForURL("**/beach");
    // Sign out, sign back in: straight to the beach.
    await page.getByRole("button", { name: /menu/i }).click();
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /enter the beach/i }).click();
    await page.waitForURL("**/beach");
  });

  test("drawer selection highlights a fixture and shows their label", async ({
    page,
  }) => {
    await signInAndCreate(page, uniqueEmail("drawer"), uniqueName("Picker"));
    await page.getByRole("button", { name: /i'm on the beach/i }).click();
    await page.waitForURL("**/beach");
    await page.getByRole("button", { name: /who's here/i }).click();
    await page
      .getByRole("dialog", { name: /who's here/i })
      .getByRole("button", { name: /priya/i })
      .click();
    await expect(page.getByRole("dialog", { name: "Priya" })).toBeVisible();
    // Escape clears the selection.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Priya" })).toHaveCount(0);
  });

  test("escape toggles the menu; zoom keys work without crashing", async ({
    page,
  }) => {
    await signInAndCreate(page, uniqueEmail("menu"), uniqueName("Menuer"));
    await page.getByRole("button", { name: /not today/i }).click();
    await page.waitForURL("**/beach");
    await expect(page.getByRole("application")).toBeVisible();
    await page.waitForTimeout(400); // let hydration attach key handlers
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(
      0,
    );
    await page.keyboard.press("+");
    await page.keyboard.press("-");
    await expect(page.getByRole("application")).toBeVisible();
  });

  test("whatsapp demo flow: connect, verify, group chip after joining", async ({
    page,
  }) => {
    const email = uniqueEmail("wa");
    await signInAndCreate(page, email, uniqueName("Wapp"));
    await page.getByRole("button", { name: /not today/i }).click();
    await page.waitForURL("**/beach");
    await page.goto("/create-character");
    await page
      .getByRole("textbox", { name: "Phone number" })
      .fill(`617${uniquePhone(1)}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /send code/i }).click();
    await expect(page.getByText(/the code is 424242/i)).toBeVisible();
    await page.getByLabel(/code from whatsapp/i).fill("424242");
    await page.getByRole("button", { name: /^verify$/i }).click();
    await expect(page.getByText(/whatsapp connected/i)).toBeVisible();
    await expect(page.getByText(/\.\.\. \d{4}/)).toBeVisible();
    // Join the beach: the group chat chip appears.
    await page
      .getByRole("link", { name: /back to beach/i })
      .first()
      .click();
    await page.waitForURL("**/beach");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(
      page.getByRole("link", { name: /open group chat/i }),
    ).toBeVisible();
    // Leaving hides it again.
    await page.getByRole("button", { name: /^leave$/i }).click();
    await expect(
      page.getByRole("link", { name: /open group chat/i }),
    ).toHaveCount(0);
  });

  test("duplicate demo phone number is rejected", async ({ page, browser }) => {
    const email = uniqueEmail("dupe-a");
    await signInAndCreate(page, email, uniqueName("First Phone"));
    await page.goto("/create-character");
    await page
      .getByRole("textbox", { name: "Phone number" })
      .fill(`617${uniquePhone(2)}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /send code/i }).click();
    await expect(page.getByText(/the code is 424242/i)).toBeVisible();

    const other = await browser.newContext();
    const page2 = await other.newPage();
    await page2.goto("http://localhost:3100/login");
    await page2.getByLabel("Email").fill(uniqueEmail("dupe-b"));
    await page2.getByRole("button", { name: /enter the beach/i }).click();
    await page2.waitForURL("**/create-character");
    await page2
      .getByRole("textbox", { name: "Phone number" })
      .fill(`617${uniquePhone(2)}`);
    await page2.getByRole("checkbox").check();
    await page2.getByRole("button", { name: /send code/i }).click();
    await expect(
      page2.getByText(/already connected to someone else/i),
    ).toBeVisible();
    await other.close();
  });

  test("reduced motion still renders the island", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("http://localhost:3100/login");
    await page.getByLabel("Email").fill(uniqueEmail("motion"));
    await page.getByRole("button", { name: /enter the beach/i }).click();
    await page.waitForURL("**/create-character");
    await page.getByLabel("Name").fill(uniqueName("Still"));
    await page.getByRole("button", { name: /save character/i }).click();
    await page.getByRole("button", { name: /i'm on the beach/i }).click();
    await page.waitForURL("**/beach");
    await expect(page.getByRole("application")).toBeVisible();
    await context.close();
  });

  test("no horizontal overflow on core routes", async ({ page }) => {
    const email = uniqueEmail("overflow");
    await signInAndCreate(page, email, uniqueName("Wide Boy"));
    for (const path of [
      "/status",
      "/create-character",
      "/beach",
      "/credits",
      "/privacy",
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.body.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `overflow on ${path}`).toBe(false);
    }
  });
});
